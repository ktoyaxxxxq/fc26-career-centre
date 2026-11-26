@echo off
setlocal
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Run npm install in the application folder before starting the app.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." %*
