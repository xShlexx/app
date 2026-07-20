#!/bin/bash
set -e

echo "=== 1. Instalando dependencias de Node ==="
npm install

echo "=== 2. Generando proyecto nativo de Android ==="
npx cap add android

echo "=== 3. Sincronizando la app (carpeta www/) al proyecto Android ==="
npx cap sync android

echo "=== Listo ==="
echo "Ahora corre:"
echo "  npm run build:apk:debug     -> genera APK de prueba (sin firmar)"
echo "  npm run build:apk:release   -> genera APK release (necesita firma)"
echo ""
echo "El APK debug queda en:"
echo "  android/app/build/outputs/apk/debug/app-debug.apk"
