@echo off
title AI Shorts Studio - Restart
echo ========================================
echo  AI Shorts Studio - Mematikan Server...
echo ========================================
echo.

taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo ========================================
echo  Memulai Ulang...
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Menjalankan 9Router (AI lokal, port 20128)...
echo       Catatan: taskkill di atas ikut mematikan 9Router kalau tadi jalan,
echo       jadi selalu dibuka ulang di sini.
start "9Router" cmd /k start-9router.bat
timeout /t 2 /nobreak >nul

echo [2/3] Menjalankan Backend Server (port 3001)...
start "AI-Shorts-Backend" cmd /k "node server/server.js"

timeout /t 3 /nobreak >nul

echo [3/3] Menjalankan Vite Dev Server (port 5173)...
start "AI-Shorts-Vite" cmd /k "npx vite --host"

echo.
echo ========================================
echo  Selesai!
echo  9Router : http://localhost:20128
echo  Backend : http://localhost:3001
echo  Frontend: http://localhost:5173
echo ========================================
echo.
pause
