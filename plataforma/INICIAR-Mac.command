#!/bin/bash
# Doble clic para arrancar ALKI Gestión en un Mac. No cierres la ventana mientras la uses.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "No encuentro Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a abrir este archivo."
  open https://nodejs.org
  read -p "Pulsa Enter para cerrar"
  exit 1
fi
if [ ! -f data/alki.db ]; then
  echo "Creando la demo con datos ficticios..."
  npm run -s demo
fi
echo ""
echo " Abriendo http://localhost:3000 en el navegador..."
echo " Usuario demo: gestion@demo.alki   Contraseña: Demo-ALKI-2026!"
echo " Para APAGAR la plataforma, cierra esta ventana."
echo ""
(sleep 3; open http://localhost:3000) &
node server/index.js
