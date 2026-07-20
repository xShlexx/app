#!/bin/bash
set -e
# Uso: ./firmar-apk.sh android/app/build/outputs/apk/release/app-release-unsigned.apk

APK_ENTRADA="$1"
KEYSTORE="mi-app.keystore"
ALIAS="mi-app"

if [ -z "$APK_ENTRADA" ]; then
  echo "Uso: ./firmar-apk.sh ruta/al/app-release-unsigned.apk"
  exit 1
fi

if [ ! -f "$KEYSTORE" ]; then
  echo "=== No existe keystore, generando uno nuevo ==="
  echo "(Guarda bien este archivo y la contraseña, los necesitas para futuras actualizaciones)"
  keytool -genkey -v -keystore "$KEYSTORE" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000
fi

echo "=== Alineando APK ==="
zipalign -v 4 "$APK_ENTRADA" app-aligned.apk

echo "=== Firmando APK ==="
apksigner sign --ks "$KEYSTORE" --ks-key-alias "$ALIAS" --out app-firmada.apk app-aligned.apk

echo "=== Verificando firma ==="
apksigner verify app-firmada.apk

echo "=== Listo: app-firmada.apk ==="
