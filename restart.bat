@echo off
title AI Shorts Studio - Restart
color 0B

echo =========================================================================
echo                       AI SHORTS STUDIO - RESTART
echo =========================================================================
echo.

cd /d "%~dp0"

echo Mematikan proses lama...

rem Dimatikan berdasarkan port yang dipakai, bukan "taskkill /IM node.exe", supaya
rem aplikasi Node lain milik Anda yang kebetulan sedang jalan tidak ikut mati.
for %%P in (3001 5173 20128 8080) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        echo    - port %%P, PID %%A
        taskkill /F /PID %%A >nul 2>nul
    )
)

rem Jendela pembantu kadang menyisakan proses induk yang sudah tidak menyimak port apa pun.
taskkill /F /FI "WINDOWTITLE eq 9Router*" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq MoneyPrinterTurbo*" >nul 2>nul

timeout /t 2 /nobreak >nul
echo Selesai. Memulai ulang semuanya...
echo.

call "%~dp0start.bat"
