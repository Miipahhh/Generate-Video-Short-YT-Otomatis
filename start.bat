@echo off
title AI Shorts Studio - 9Router and Hermes AI
color 0B

echo =========================================================================
echo                AI SHORTS STUDIO - 9ROUTER AND HERMES AI
echo        Otomatis Buat dan Upload Video Shorts Vertikal 9:16 (FFMPEG)
echo =========================================================================
echo.

cd /d "%~dp0"

echo [1/4] Memeriksa dan memuat database persisten lokal...
if not exist "server\data" mkdir "server\data"

echo [2/4] Memeriksa 9Router (AI lokal di port 20128)...
netstat -ano | findstr ":20128" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo       9Router sudah berjalan, lanjut.
) else (
    echo       9Router belum jalan, membuka di jendela baru...
    start "9Router" cmd /k start-9router.bat
    timeout /t 2 /nobreak >nul
)

echo [3/4] Menyiapkan Browser Frontend Web Studio (akan terbuka otomatis)...
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"

echo [4/4] Menjalankan Backend (port 3001) dan Frontend (port 5173)...
echo.
npm run dev
