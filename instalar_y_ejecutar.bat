@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo GymControl - React + Vite + Supabase
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 20.19 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
if not exist .env.local (
  echo.
  echo Debes crear .env.local copiando .env.example y rellenar los datos de Supabase.
  echo La portada podra verse, pero los usuarios no podran entrar hasta configurarlo.
  echo.
)
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (echo Fallo npm install && pause && exit /b 1)
)
echo Abriendo servidor Vite en http://localhost:5173
call npm run dev
pause
