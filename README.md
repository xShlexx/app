# YM Dashboard - App Android offline (Turnos + Finanzas)

App 100% offline. No usa PHP, no usa servidor, no usa base de datos externa.
Todos los datos (turnos y finanzas) se guardan directo en el almacenamiento
local del teléfono. No incluye galería ni login: solo turnos y finanzas,
como pediste.

## Qué reemplaza del dashboard.php original
- **Turnos**: crear, editar y eliminar turnos. Respeta la misma regla de
  horarios que tenías: 08:30 y 13:30, excepto sábados que solo tiene 08:30.
  No deja crear dos turnos en el mismo horario. Los turnos de fechas
  pasadas se limpian solos al abrir la app.
- **Finanzas**: carga diaria por turno (mañana/tarde) de efectivo,
  transferencia, pedicura efectivo y pedicura transferencia. Vistas
  Diario / Semanal / Mensual con los mismos cálculos que tenías
  (inversión 30%, ganancia neta 70% + pedicura).
- **Backup/Restaurar**: como ya no hay servidor ni base de datos, agregué
  botones de exportar/importar backup en formato .json arriba a la derecha.
  Te recomiendo exportar backup de vez en cuando por si cambiás de celular
  o desinstalás la app (los datos viven solo en ese dispositivo).

## Requisitos previos en tu máquina Linux
- Node.js + npm
- JDK 17
- Android SDK (variable de entorno `ANDROID_HOME`)
- `zipalign` y `apksigner` (vienen en `build-tools` del Android SDK)

## Pasos

1. Da permisos de ejecución a los scripts:
   ```bash
   chmod +x setup.sh firmar-apk.sh
   ```

2. Corre el setup (instala dependencias, genera y sincroniza el proyecto
   Android nativo con la app que ya está en `www/`):
   ```bash
   ./setup.sh
   ```

3. Compila el APK de prueba (sin firmar, instalable directo para testear):
   ```bash
   npm run build:apk:debug
   ```
   Queda en: `android/app/build/outputs/apk/debug/app-debug.apk`

4. Para instalar en tu celular: pasale ese .apk (por USB, WhatsApp, drive,
   etc.), abrilo desde el explorador de archivos y aceptá instalar de
   "fuentes desconocidas" cuando Android lo pida.

5. Si más adelante querés publicarla en Play Store o repartirla ya firmada
   de forma definitiva:
   ```bash
   npm run build:apk:release
   ./firmar-apk.sh android/app/build/outputs/apk/release/app-release-unsigned.apk
   ```
   Esto genera `app-firmada.apk`.

## Estructura de la app (por si querés tocar algo)
- `www/index.html` — pantallas y modales
- `www/style.css` — estilos (colores tomados de tu dashboard original)
- `www/app.js` — toda la lógica: turnos, finanzas, backup

## Notas
- Guarda tu `mi-app.keystore` (se genera la primera vez que corras
  `firmar-apk.sh`) en un lugar seguro: sin ese archivo no vas a poder
  actualizar la app más adelante con la misma firma.
- Si en algún momento querés que la app también se sincronice con tu
  servidor (por ejemplo para tener los turnos en la web y en el celular
  a la vez), se puede agregar después — pero eso ya requeriría conexión
  a internet y tocar el backend PHP.
