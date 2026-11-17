@echo off
chcp 65001 >nul
title ALKI Gestion - no cierres esta ventana
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No encuentro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  echo.
  start https://nodejs.org
  pause
  exit /b
)
if not exist "data\alki.db" (
  echo Creando la demo con datos ficticios...
  call npm run -s demo
)
echo.
echo  Abriendo http://localhost:3000 en el navegador...
echo  Usuario demo: gestion@demo.alki   Contrasena: Demo-ALKI-2026!
echo  Para APAGAR la plataforma, cierra esta ventana.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server\index.js
pause
