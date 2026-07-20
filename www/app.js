/* ===========================================================
   YM Dashboard - App offline (Turnos + Finanzas)
   Todos los datos se guardan en el almacenamiento local del
   teléfono (localStorage dentro del WebView). No requiere
   internet ni servidor.
=========================================================== */

const STORAGE_KEYS = {
  appointments: 'ym_appointments',
  finances: 'ym_finances'
};

// ---------- Notificaciones locales ----------
// Aviso 1: la noche anterior, a esta hora fija.
const NIGHT_BEFORE_HOUR = 20;   // 8:00 PM
const NIGHT_BEFORE_MINUTE = 0;
// Aviso 2: minutos de anticipación antes del turno.
const NOTIFY_MINUTES_BEFORE = 60;

function getLocalNotifications() {
  return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications)
    ? window.Capacitor.Plugins.LocalNotifications
    : null;
}

async function initNotifications() {
  const LN = getLocalNotifications();
  if (!LN) return; // corriendo en navegador normal, sin plugin nativo
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== 'granted') {
      await LN.requestPermissions();
    }
  } catch (e) {
    console.warn('No se pudo solicitar permiso de notificaciones', e);
  }
}

// Convierte el id string del turno (ej: "a_167...") en un entero estable y
// chico, porque el plugin de notificaciones requiere ids numéricos únicos.
// Cada turno usa 2 ids: uno para el aviso de la noche anterior y otro para
// el de 1 hora antes.
function notifBaseIdFor(apptId) {
  let hash = 0;
  for (let i = 0; i < apptId.length; i++) {
    hash = (hash * 31 + apptId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000000000) || 1;
}
function notifNightIdFor(apptId) { return notifBaseIdFor(apptId) * 2; }
function notifHourIdFor(apptId) { return notifBaseIdFor(apptId) * 2 + 1; }

async function scheduleAppointmentNotification(appt) {
  const LN = getLocalNotifications();
  if (!LN) return;

  const [h, m] = appt.appointment_time.split(':').map(Number);
  const apptDate = new Date(appt.appointment_date + 'T00:00:00');
  apptDate.setHours(h, m, 0, 0);

  const nightBefore = new Date(apptDate);
  nightBefore.setDate(nightBefore.getDate() - 1);
  nightBefore.setHours(NIGHT_BEFORE_HOUR, NIGHT_BEFORE_MINUTE, 0, 0);

  const hourBefore = new Date(apptDate.getTime() - NOTIFY_MINUTES_BEFORE * 60000);

  const label = appt.is_extra ? 'Turno extra' : 'Turno';
  const timeLabel = formatTimeLabel(appt.appointment_time);
  const nightId = notifNightIdFor(appt.id);
  const hourId = notifHourIdFor(appt.id);

  const notifications = [];
  if (nightBefore.getTime() > Date.now()) {
    notifications.push({
      id: nightId,
      title: `${label} mañana`,
      body: `${appt.client_name} - mañana a las ${timeLabel}`,
      schedule: { at: nightBefore, allowWhileIdle: true }
    });
  }
  if (hourBefore.getTime() > Date.now()) {
    notifications.push({
      id: hourId,
      title: `${label} en 1 hora`,
      body: `${appt.client_name} - hoy a las ${timeLabel}`,
      schedule: { at: hourBefore, allowWhileIdle: true }
    });
  }

  try {
    await LN.cancel({ notifications: [{ id: nightId }, { id: hourId }] });
    if (notifications.length) {
      await LN.schedule({ notifications });
    }
  } catch (e) {
    console.warn('No se pudo programar la notificación', e);
  }
}

async function cancelAppointmentNotification(apptId) {
  const LN = getLocalNotifications();
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: notifNightIdFor(apptId) }, { id: notifHourIdFor(apptId) }] });
  } catch (e) {
    console.warn('No se pudo cancelar la notificación', e);
  }
}

// Reprograma los recordatorios de todos los turnos futuros (por si la app
// se reinstaló o se otorgó el permiso recién ahora).
async function resyncAppointmentNotifications() {
  const LN = getLocalNotifications();
  if (!LN) return;
  const list = loadAppointments();
  for (const appt of list) {
    await scheduleAppointmentNotification(appt);
  }
}

// ---------- Utilidades ----------
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return n.toString().padStart(2, '0'); }
function fmtMoney(n) {
  return '$' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}
function fmtDateFull(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
function dayName(dateStr) {
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const d = new Date(dateStr + 'T00:00:00');
  return names[d.getDay()];
}
function isSaturday(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay() === 6;
}
function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}
function relativeDayLabel(dateStr) {
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays <= -2) return 'Pasado';
  return 'Próx';
}
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
// Cupos totales por día: domingo no se trabaja, sábado 1 turno, resto 2 turnos
function slotsForDate(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  if (day === 0) return 0;
  if (day === 6) return 1;
  return 2;
}
function uid() {
  return 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
function formatTimeLabel(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}
function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { el.className = 'toast'; }, 2200);
}

// ---------- Storage ----------
function loadAppointments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.appointments)) || []; }
  catch (e) { return []; }
}
function saveAppointments(list) {
  localStorage.setItem(STORAGE_KEYS.appointments, JSON.stringify(list));
}
function loadFinances() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.finances)) || {}; }
  catch (e) { return {}; }
}
function saveFinances(obj) {
  localStorage.setItem(STORAGE_KEYS.finances, JSON.stringify(obj));
}

// Elimina turnos que ya pasaron hace 3 días o más (antes se borraban apenas pasaba el día)
function cleanupPastAppointments() {
  const today = new Date(todayStr() + 'T00:00:00');
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 2); // se conservan hasta 2 días pasados; al 3er día se borran
  const cutoffStr = toDateStr(cutoff);
  const list = loadAppointments();
  const filtered = list.filter(a => a.appointment_date >= cutoffStr);
  if (filtered.length !== list.length) saveAppointments(filtered);
}

// ---------- TURNOS ----------
const ALL_TIMES = ['13:30', '15:30'];

function getAvailableTimes(dateStr, excludeId) {
  if (!dateStr) return [];
  const totalSlots = slotsForDate(dateStr);
  if (totalSlots === 0) return [];
  const base = totalSlots === 1 ? ['13:30'] : ALL_TIMES.slice();
  const list = loadAppointments();
  const taken = list
    .filter(a => a.appointment_date === dateStr && a.id !== excludeId && !a.is_extra)
    .map(a => a.appointment_time);
  return base.filter(t => !taken.includes(t));
}

function renderAppointments() {
  cleanupPastAppointments();
  const list = loadAppointments().slice().sort((a, b) => {
    if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? -1 : 1;
    return a.appointment_time < b.appointment_time ? -1 : 1;
  });

  const container = document.getElementById('appointmentsList');
  container.innerHTML = '';

  document.getElementById('appointmentsCount').textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">calendar_month</span><p>No hay turnos cargados.<br>Andá a la sección Calendario para agregar uno.</p></div>`;
    return;
  }

  list.forEach(a => {
    const card = document.createElement('div');
    card.className = 'appt-card';
    const [y, m, d] = a.appointment_date.split('-');
    const monthAbbr = MONTH_NAMES[parseInt(m, 10) - 1].slice(0, 3).toUpperCase();
    const timeLabel = formatTimeLabel(a.appointment_time);
    card.innerHTML = `
      <div class="appt-badge">
        <span class="appt-badge-month">${monthAbbr}</span>
        <span class="appt-badge-day">${parseInt(d, 10)}</span>
      </div>
      <div class="appt-card-body">
        <div class="appt-card-top">
          <div class="appt-name">${escapeHtml(a.client_name)}${a.is_extra ? '<span class="appt-extra-badge">Extra</span>' : ''}</div>
          <span class="appt-time-pill">${timeLabel}</span>
        </div>
        <div class="appt-meta">${a.phone ? '<span class="material-symbols-outlined">call</span> ' + escapeHtml(a.phone) : 'Sin teléfono'}</div>
        <div class="appt-card-footer">
          <span class="appt-status-pill">${relativeDayLabel(a.appointment_date)}</span>
          <div class="appt-actions">
            <button class="icon-btn" data-edit="${a.id}" title="Editar"><span class="material-symbols-outlined">edit</span></button>
            <button class="icon-btn danger" data-del="${a.id}" title="Eliminar"><span class="material-symbols-outlined">delete</span></button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const appt = loadAppointments().find(a => a.id === btn.dataset.edit);
      if (appt && appt.is_extra) openExtraApptModal(btn.dataset.edit);
      else openAppointmentModal(btn.dataset.edit);
    });
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteAppointment(btn.dataset.del));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function deleteAppointment(id) {
  if (!confirm('¿Eliminar este turno?')) return;
  const list = loadAppointments().filter(a => a.id !== id);
  saveAppointments(list);
  cancelAppointmentNotification(id);
  renderAppointments();
  renderCalendar();
  toast('Turno eliminado');
}

function openAppointmentModal(editId, fixedDate) {
  const modal = document.getElementById('appointmentModal');
  const form = document.getElementById('appointmentForm');
  const dateInput = document.getElementById('apptDate');
  const timeSelect = document.getElementById('apptTime');
  form.reset();
  document.getElementById('appointmentEditId').value = '';
  dateInput.disabled = false;
  dateInput.classList.remove('is-locked');
  timeSelect.disabled = false;
  timeSelect.classList.remove('is-locked');

  if (editId) {
    const appt = loadAppointments().find(a => a.id === editId);
    if (!appt) return;
    document.getElementById('appointmentModalTitle').textContent = 'Editar turno';
    document.getElementById('appointmentEditId').value = appt.id;
    document.getElementById('apptClientName').value = appt.client_name;
    dateInput.value = appt.appointment_date;
    dateInput.disabled = true;
    dateInput.classList.add('is-locked');
    document.getElementById('apptPhone').value = appt.phone || '';
    updateTimeOptions(appt.appointment_date, appt.id);
    timeSelect.value = appt.appointment_time;
    timeSelect.disabled = true;
    timeSelect.classList.add('is-locked');
    document.getElementById('deleteApptBtn').style.display = 'block';
  } else {
    document.getElementById('appointmentModalTitle').textContent = 'Nuevo turno';
    const dateToUse = fixedDate || todayStr();
    dateInput.value = dateToUse;
    if (fixedDate) {
      dateInput.disabled = true;
      dateInput.classList.add('is-locked');
    }
    updateTimeOptions(dateToUse, null);
    document.getElementById('deleteApptBtn').style.display = 'none';
  }
  modal.classList.add('active');
}

function closeAppointmentModal() {
  document.getElementById('appointmentModal').classList.remove('active');
}

function updateTimeOptions(dateStr, excludeId) {
  const select = document.getElementById('apptTime');
  const available = getAvailableTimes(dateStr, excludeId);
  select.innerHTML = '';
  if (available.length === 0) {
    select.innerHTML = '<option value="">Sin horarios disponibles</option>';
    return;
  }
  available.forEach(t => {
    select.innerHTML += `<option value="${t}">${formatTimeLabel(t)}</option>`;
  });
}

function handleAppointmentSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('appointmentEditId').value;
  const client_name = document.getElementById('apptClientName').value.trim();
  const appointment_date = document.getElementById('apptDate').value;
  const appointment_time = document.getElementById('apptTime').value;
  const phone = document.getElementById('apptPhone').value.trim();

  if (!client_name || !appointment_date || !appointment_time) {
    toast('Completá nombre, fecha y horario', true);
    return;
  }

  const list = loadAppointments();
  let savedAppt;

  if (editId) {
    const idx = list.findIndex(a => a.id === editId);
    if (idx > -1) {
      list[idx] = { ...list[idx], client_name, appointment_date, appointment_time, phone };
      savedAppt = list[idx];
    }
  } else {
    savedAppt = { id: uid(), client_name, appointment_date, appointment_time, phone, status: 'confirmed' };
    list.push(savedAppt);
  }

  saveAppointments(list);
  closeAppointmentModal();
  renderAppointments();
  renderCalendar();
  if (savedAppt) scheduleAppointmentNotification(savedAppt);
  toast('Turno guardado correctamente');
}

// ---------- TURNOS EXTRA (fecha y horario libres, no cuentan contra los cupos) ----------
function openExtraApptModal(editId) {
  const modal = document.getElementById('extraApptModal');
  const form = document.getElementById('extraApptForm');
  form.reset();
  document.getElementById('extraApptEditId').value = '';

  if (editId) {
    const appt = loadAppointments().find(a => a.id === editId);
    if (!appt) return;
    document.getElementById('extraApptModalTitle').textContent = 'Editar turno extra';
    document.getElementById('extraApptEditId').value = appt.id;
    document.getElementById('extraApptClientName').value = appt.client_name;
    document.getElementById('extraApptDate').value = appt.appointment_date;
    document.getElementById('extraApptTime').value = appt.appointment_time;
    document.getElementById('extraApptPhone').value = appt.phone || '';
    document.getElementById('deleteExtraApptBtn').style.display = 'block';
  } else {
    document.getElementById('extraApptModalTitle').textContent = 'Turno extra';
    document.getElementById('extraApptDate').value = todayStr();
    document.getElementById('deleteExtraApptBtn').style.display = 'none';
  }
  modal.classList.add('active');
}

function closeExtraApptModal() {
  document.getElementById('extraApptModal').classList.remove('active');
}

function handleExtraApptSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('extraApptEditId').value;
  const client_name = document.getElementById('extraApptClientName').value.trim();
  const appointment_date = document.getElementById('extraApptDate').value;
  const appointment_time = document.getElementById('extraApptTime').value;
  const phone = document.getElementById('extraApptPhone').value.trim();

  if (!client_name || !appointment_date || !appointment_time) {
    toast('Completá nombre, fecha y horario', true);
    return;
  }

  const list = loadAppointments();
  let savedAppt;

  if (editId) {
    const idx = list.findIndex(a => a.id === editId);
    if (idx > -1) {
      list[idx] = { ...list[idx], client_name, appointment_date, appointment_time, phone, is_extra: true };
      savedAppt = list[idx];
    }
  } else {
    savedAppt = { id: uid(), client_name, appointment_date, appointment_time, phone, status: 'confirmed', is_extra: true };
    list.push(savedAppt);
  }

  saveAppointments(list);
  closeExtraApptModal();
  renderAppointments();
  renderCalendar();
  if (savedAppt) scheduleAppointmentNotification(savedAppt);
  toast('Turno extra guardado correctamente');
}

function deleteExtraAppointment() {
  const editId = document.getElementById('extraApptEditId').value;
  if (!editId) return;
  if (!confirm('¿Eliminar este turno extra?')) return;
  const list = loadAppointments().filter(a => a.id !== editId);
  saveAppointments(list);
  cancelAppointmentNotification(editId);
  closeExtraApptModal();
  renderAppointments();
  renderCalendar();
  toast('Turno extra eliminado');
}

// ---------- FINANZAS ----------
const FIN_FIELDS = [
  'morning_income', 'morning_pedicure', 'morning_transfer', 'morning_pedicure_transfer',
  'afternoon_income', 'afternoon_pedicure', 'afternoon_transfer', 'afternoon_pedicure_transfer'
];

function emptyFinanceRecord() {
  const r = {};
  FIN_FIELDS.forEach(f => r[f] = 0);
  return r;
}

function computeTotals(record) {
  const r = record || emptyFinanceRecord();
  const totalIncome = (r.morning_income || 0) + (r.afternoon_income || 0);
  const totalPedicure = (r.morning_pedicure || 0) + (r.afternoon_pedicure || 0);
  const totalTransfer = (r.morning_transfer || 0) + (r.afternoon_transfer || 0);
  const totalPedTransfer = (r.morning_pedicure_transfer || 0) + (r.afternoon_pedicure_transfer || 0);

  const grandTotal = totalIncome + totalTransfer + totalPedicure + totalPedTransfer;
  const incomeForInvestment = totalIncome + totalTransfer;
  const investmentAmount = incomeForInvestment * 0.30;
  const netProfit = incomeForInvestment * 0.70 + totalPedicure + totalPedTransfer;

  return {
    totalIncome, totalPedicure, totalTransfer, totalPedTransfer,
    grandTotal, investmentAmount, netProfit,
    efectivo: totalIncome + totalPedicure,
    transferencia: totalTransfer + totalPedTransfer,
    pedicuraTotal: totalPedicure + totalPedTransfer
  };
}

function sumRecords(records) {
  const acc = emptyFinanceRecord();
  records.forEach(r => FIN_FIELDS.forEach(f => acc[f] += (r[f] || 0)));
  return acc;
}

function getWeekRange(baseDate) {
  const d = new Date(baseDate + 'T00:00:00');
  const day = d.getDay(); // 0=domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}
function toDateStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function renderFinanceKPIs(elPrefix, totals) {
  document.getElementById(elPrefix + 'Grand').textContent = fmtMoney(totals.grandTotal);
  document.getElementById(elPrefix + 'Efectivo').textContent = fmtMoney(totals.efectivo);
  document.getElementById(elPrefix + 'Transferencia').textContent = fmtMoney(totals.transferencia);
  document.getElementById(elPrefix + 'Pedicura').textContent = fmtMoney(totals.pedicuraTotal);
  document.getElementById(elPrefix + 'Inversion').textContent = '-' + fmtMoney(totals.investmentAmount);
  document.getElementById(elPrefix + 'Ganancia').textContent = fmtMoney(totals.netProfit);
}

function renderDailyFinance() {
  const finances = loadFinances();
  const dates = Object.keys(finances).sort();
  const selectedDate = document.getElementById('financeDailyDate').value ||
    (dates.length ? dates[dates.length - 1] : todayStr());
  document.getElementById('financeDailyDate').value = selectedDate;

  const record = finances[selectedDate];
  const totals = computeTotals(record);
  renderFinanceKPIs('daily', totals);

  document.getElementById('dailyRecordDate').textContent = record ? fmtDateFull(selectedDate) : 'Sin registro para este día';

  const box = document.getElementById('dailyBreakdown');
  if (!record) {
    box.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">payments</span><p>No hay finanzas cargadas para esta fecha.</p></div>`;
    return;
  }
  box.innerHTML = `
    <table class="finance-table">
      <thead><tr><th style="text-align:left">Turno</th><th>Efectivo</th><th>Transf.</th><th>Ped. efec.</th><th>Ped. transf.</th></tr></thead>
      <tbody>
        <tr><td style="text-align:left">Turno 1</td><td>${fmtMoney(record.morning_income)}</td><td>${fmtMoney(record.morning_transfer)}</td><td>${fmtMoney(record.morning_pedicure)}</td><td>${fmtMoney(record.morning_pedicure_transfer)}</td></tr>
        <tr><td style="text-align:left">Turno 2</td><td>${fmtMoney(record.afternoon_income)}</td><td>${fmtMoney(record.afternoon_transfer)}</td><td>${fmtMoney(record.afternoon_pedicure)}</td><td>${fmtMoney(record.afternoon_pedicure_transfer)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderWeeklyFinance() {
  const finances = loadFinances();
  const { start, end } = getWeekRange(todayStr());
  document.getElementById('weekRangeLabel').textContent = `${fmtDateShort(start)} — ${fmtDateFull(end)}`;

  const dates = Object.keys(finances).filter(d => d >= start && d <= end).sort();
  const records = dates.map(d => finances[d]);
  const totals = computeTotals(sumRecords(records));
  renderFinanceKPIs('week', totals);

  const box = document.getElementById('weeklyTable');
  if (dates.length === 0) {
    box.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">event_busy</span><p>No hay datos registrados para esta semana.</p></div>`;
    return;
  }
  box.innerHTML = buildDayTable(dates, finances, true);
}

function renderMonthlyFinance() {
  const finances = loadFinances();
  const ym = todayStr().slice(0, 7);
  const dates = Object.keys(finances).filter(d => d.startsWith(ym)).sort();
  const records = dates.map(d => finances[d]);
  const totals = computeTotals(sumRecords(records));
  renderFinanceKPIs('month', totals);

  const [y, m] = ym.split('-');
  document.getElementById('monthLabel').textContent = `${MONTH_NAMES[parseInt(m,10)-1]} ${y}`;

  const box = document.getElementById('monthlyTable');
  if (dates.length === 0) {
    box.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">event_busy</span><p>No hay datos registrados para este mes.</p></div>`;
    return;
  }
  box.innerHTML = buildDayTable(dates, finances, false);
}

function buildDayTable(dates, finances, withDayName) {
  let rows = '';
  dates.forEach(d => {
    const t = computeTotals(finances[d]);
    const label = withDayName ? `${dayName(d)} ${fmtDateShort(d)}` : fmtDateShort(d);
    rows += `<tr>
      <td style="text-align:left">${label}</td>
      <td>${fmtMoney(t.efectivo)}</td>
      <td class="transf">${fmtMoney(t.transferencia)}</td>
      <td class="ped">${fmtMoney(t.pedicuraTotal)}</td>
      <td class="net">${fmtMoney(t.netProfit)}</td>
    </tr>`;
  });
  return `<div style="overflow-x:auto"><table class="finance-table">
    <thead><tr><th style="text-align:left">Día</th><th>Efectivo</th><th>Transf.</th><th>Ped.</th><th>Ganancia</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function showFinanceTab(tab) {
  ['daily', 'weekly', 'monthly'].forEach(t => {
    document.getElementById('fintab-' + t).classList.toggle('active', t === tab);
    document.getElementById('finbtn-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'daily') renderDailyFinance();
  if (tab === 'weekly') renderWeeklyFinance();
  if (tab === 'monthly') renderMonthlyFinance();
}

function openFinanceModal() {
  const finances = loadFinances();
  const modal = document.getElementById('financeModal');
  const form = document.getElementById('financeForm');
  form.reset();
  const dateInput = document.getElementById('finDate');
  dateInput.value = todayStr();
  fillFinanceFormFromRecord(finances[todayStr()]);
  modal.classList.add('active');
}

function fillFinanceFormFromRecord(record) {
  const r = record || emptyFinanceRecord();
  FIN_FIELDS.forEach(f => {
    const el = document.getElementById('fin_' + f);
    if (el) el.value = r[f] || '';
  });
}

function closeFinanceModal() {
  document.getElementById('financeModal').classList.remove('active');
}

function handleFinanceSubmit(e) {
  e.preventDefault();
  const date = document.getElementById('finDate').value;
  if (!date) { toast('Elegí una fecha', true); return; }

  const finances = loadFinances();
  const record = emptyFinanceRecord();
  FIN_FIELDS.forEach(f => {
    const val = document.getElementById('fin_' + f).value;
    record[f] = val === '' ? 0 : parseFloat(val);
  });
  finances[date] = record;
  saveFinances(finances);
  closeFinanceModal();
  document.getElementById('financeDailyDate').value = date;
  showFinanceTab('daily');
  toast('Finanzas guardadas correctamente');
}

// ---------- Backup: exportar / importar ----------
function exportData() {
  const data = {
    appointments: loadAppointments(),
    finances: loadFinances(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_ym_${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup exportado');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.appointments) saveAppointments(data.appointments);
      if (data.finances) saveFinances(data.finances);
      renderAppointments();
      renderCalendar();
      showFinanceTab('daily');
      toast('Backup restaurado correctamente');
    } catch (e) {
      toast('El archivo no es un backup válido', true);
    }
  };
  reader.readAsText(file);
}

// ---------- CALENDARIO ----------
let calendarViewYear = new Date().getFullYear();
let calendarViewMonth = new Date().getMonth(); // 0-11

function changeCalendarMonth(delta) {
  calendarViewMonth += delta;
  if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
  if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
  renderCalendar(delta);
}

function renderCalendar(direction = 0) {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calMonthLabel');
  if (!grid || !label) return;

  label.textContent = `${MONTH_NAMES[calendarViewMonth]} ${calendarViewYear}`;

  const firstDay = new Date(calendarViewYear, calendarViewMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarViewYear, calendarViewMonth, 0).getDate();
  const today = todayStr();
  const appointments = loadAppointments();

  let html = '';

  for (let i = 0; i < startWeekday; i++) {
    const dayNum = daysInPrevMonth - startWeekday + 1 + i;
    html += `<div class="cal-day other-month"><span class="cal-num">${dayNum}</span><span class="cal-tag">Mes ant.</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(calendarViewYear, calendarViewMonth, d);
    const dateStr = toDateStr(dateObj);
    const weekday = dateObj.getDay();
    const isToday = dateStr === today;

    let statusClass, tag, clickable = false;

    if (weekday === 0) {
      statusClass = 'sunday';
      tag = 'Domingo';
    } else if (dateStr < today) {
      statusClass = 'past';
      tag = 'Pasó';
    } else {
      const total = slotsForDate(dateStr);
      const taken = appointments.filter(a => a.appointment_date === dateStr && !a.is_extra).length;
      const available = total - taken;
      if (available <= 0) {
        statusClass = 'full';
        tag = 'Lleno';
      } else if (available === 1) {
        statusClass = 'low';
        tag = '1 disp.';
        clickable = true;
      } else {
        statusClass = 'open';
        tag = available + ' disp.';
        clickable = true;
      }
    }

    html += `<div class="cal-day ${statusClass}${isToday ? ' today' : ''}" data-status="${statusClass}" ${clickable ? `data-date="${dateStr}"` : ''}>
      <span class="cal-num">${d}</span>
      <span class="cal-tag">${tag}</span>
    </div>`;
  }

  grid.innerHTML = html;

  if (direction !== 0) {
    const animClass = direction > 0 ? 'cal-anim-next' : 'cal-anim-prev';
    grid.classList.remove('cal-anim-next', 'cal-anim-prev');
    label.classList.remove('cal-label-fade');
    void grid.offsetWidth; // fuerza reflow para reiniciar la animación
    grid.classList.add(animClass);
    label.classList.add('cal-label-fade');
  }

  grid.querySelectorAll('.cal-day[data-date], .cal-day.sunday, .cal-day.past, .cal-day.full').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const status = cell.dataset.status;
      if (date) {
        openAppointmentModal(null, date);
      } else if (status === 'sunday') {
        toast('Los domingos no se trabaja', true);
      } else if (status === 'past') {
        toast('Ese día ya pasó', true);
      } else if (status === 'full') {
        toast('Ese día ya está lleno', true);
      }
    });
  });
}

// ---------- Swipe del calendario (deslizar para cambiar de mes) ----------
function setupCalendarSwipe() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  let startX = 0, startY = 0, tracking = false;
  const THRESHOLD = 40;

  grid.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  grid.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) changeCalendarMonth(1);
      else changeCalendarMonth(-1);
    }
  }, { passive: true });
}

// ---------- Navegación principal ----------
function showMainSection(section) {
  ['turnos', 'calendario', 'finanzas'].forEach(s => {
    document.getElementById('section-' + s).classList.toggle('active', s === section);
    document.getElementById('navbtn-' + s).classList.toggle('active', s === section);
  });
  if (section === 'calendario') renderCalendar();
}

// ---------- Menú lateral (drawer) ----------
function openDrawer() {
  document.getElementById('drawer').classList.add('active');
  document.getElementById('drawerBackdrop').classList.add('active');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('active');
  document.getElementById('drawerBackdrop').classList.remove('active');
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  renderAppointments();
  showFinanceTab('daily');
  renderCalendar();
  setupCalendarSwipe();
  initNotifications().then(resyncAppointmentNotifications);

  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);
  document.getElementById('navbtn-turnos').addEventListener('click', () => { showMainSection('turnos'); closeDrawer(); });
  document.getElementById('navbtn-calendario').addEventListener('click', () => { showMainSection('calendario'); closeDrawer(); });
  document.getElementById('navbtn-finanzas').addEventListener('click', () => { showMainSection('finanzas'); closeDrawer(); });

  document.getElementById('calPrevBtn').addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('calNextBtn').addEventListener('click', () => changeCalendarMonth(1));

  document.getElementById('closeApptModal').addEventListener('click', closeAppointmentModal);
  document.getElementById('appointmentForm').addEventListener('submit', handleAppointmentSubmit);
  document.getElementById('apptDate').addEventListener('change', (e) => {
    const editId = document.getElementById('appointmentEditId').value || null;
    updateTimeOptions(e.target.value, editId);
  });
  document.getElementById('deleteApptBtn').addEventListener('click', () => {
    const id = document.getElementById('appointmentEditId').value;
    closeAppointmentModal();
    if (id) deleteAppointment(id);
  });

  document.getElementById('openExtraApptBtn').addEventListener('click', () => openExtraApptModal(null));
  document.getElementById('closeExtraApptModal').addEventListener('click', closeExtraApptModal);
  document.getElementById('extraApptForm').addEventListener('submit', handleExtraApptSubmit);
  document.getElementById('deleteExtraApptBtn').addEventListener('click', deleteExtraAppointment);

  document.getElementById('openFinanceModalBtn').addEventListener('click', openFinanceModal);
  document.getElementById('closeFinanceModal').addEventListener('click', closeFinanceModal);
  document.getElementById('financeForm').addEventListener('submit', handleFinanceSubmit);

  document.getElementById('finbtn-daily').addEventListener('click', () => showFinanceTab('daily'));
  document.getElementById('finbtn-weekly').addEventListener('click', () => showFinanceTab('weekly'));
  document.getElementById('finbtn-monthly').addEventListener('click', () => showFinanceTab('monthly'));
  document.getElementById('financeDailyDate').addEventListener('change', renderDailyFinance);

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importTriggerBtn').addEventListener('click', () => {
    document.getElementById('importInput').click();
  });
  document.getElementById('importInput').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });
});