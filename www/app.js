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

// Elimina turnos de fechas ya pasadas (igual que el DELETE ... < CURDATE() del PHP)
function cleanupPastAppointments() {
  const today = todayStr();
  const list = loadAppointments();
  const filtered = list.filter(a => a.appointment_date >= today);
  if (filtered.length !== list.length) saveAppointments(filtered);
}

// ---------- TURNOS ----------
const ALL_TIMES = ['08:30', '13:30'];

function getAvailableTimes(dateStr, excludeId) {
  if (!dateStr) return [];
  const totalSlots = slotsForDate(dateStr);
  if (totalSlots === 0) return [];
  const base = totalSlots === 1 ? ['08:30'] : ALL_TIMES.slice();
  const list = loadAppointments();
  const taken = list
    .filter(a => a.appointment_date === dateStr && a.id !== excludeId)
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
    card.innerHTML = `
      <div>
        <div class="appt-date">${dayName(a.appointment_date)} ${fmtDateFull(a.appointment_date)} · ${a.appointment_time}</div>
        <div class="appt-name">${escapeHtml(a.client_name)}</div>
        <div class="appt-meta">${a.phone ? '<span class="material-symbols-outlined">call</span> ' + escapeHtml(a.phone) : 'Sin teléfono'}</div>
      </div>
      <div class="appt-actions">
        <button class="icon-btn" data-edit="${a.id}" title="Editar"><span class="material-symbols-outlined">edit</span></button>
        <button class="icon-btn danger" data-del="${a.id}" title="Eliminar"><span class="material-symbols-outlined">delete</span></button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openAppointmentModal(btn.dataset.edit));
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
  renderAppointments();
  renderCalendar();
  toast('Turno eliminado');
}

function openAppointmentModal(editId, fixedDate) {
  const modal = document.getElementById('appointmentModal');
  const form = document.getElementById('appointmentForm');
  const dateInput = document.getElementById('apptDate');
  form.reset();
  document.getElementById('appointmentEditId').value = '';
  dateInput.disabled = false;
  dateInput.classList.remove('is-locked');

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
    document.getElementById('apptTime').value = appt.appointment_time;
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
    const label = t === '08:30' ? '08:30 AM' : '01:30 PM';
    select.innerHTML += `<option value="${t}">${label}</option>`;
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

  if (editId) {
    const idx = list.findIndex(a => a.id === editId);
    if (idx > -1) list[idx] = { ...list[idx], client_name, appointment_date, appointment_time, phone };
  } else {
    list.push({ id: uid(), client_name, appointment_date, appointment_time, phone, status: 'confirmed' });
  }

  saveAppointments(list);
  closeAppointmentModal();
  renderAppointments();
  renderCalendar();
  toast('Turno guardado correctamente');
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
        <tr><td style="text-align:left">Mañana</td><td>${fmtMoney(record.morning_income)}</td><td>${fmtMoney(record.morning_transfer)}</td><td>${fmtMoney(record.morning_pedicure)}</td><td>${fmtMoney(record.morning_pedicure_transfer)}</td></tr>
        <tr><td style="text-align:left">Tarde</td><td>${fmtMoney(record.afternoon_income)}</td><td>${fmtMoney(record.afternoon_transfer)}</td><td>${fmtMoney(record.afternoon_pedicure)}</td><td>${fmtMoney(record.afternoon_pedicure_transfer)}</td></tr>
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
  renderCalendar();
}

function renderCalendar() {
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
      const taken = appointments.filter(a => a.appointment_date === dateStr).length;
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