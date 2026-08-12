@echo off
title AI Shorts Studio
color 0B

echo =========================================================================
echo                            AI SHORTS STUDIO
echo     Buat dan upload video YouTube Shorts 9:16 otomatis (AI + FFmpeg)
echo =========================================================================
echo.

cd /d "%~dp0"

echo [1/6] Menyiapkan folder database lokal...
if not exist "server\data" mkdir "server\data"

echo [2/6] Memeriksa dependensi Node...
if not exist "node_modules" (
    echo       Belum terpasang. Menjalankan npm install, cukup sekali saja...
    call npm install
) else (
    echo       Sudah terpasang.
)

echo [3/6] Memeriksa 9Router - AI penulis naskah, port 20128...
netstat -ano | findstr ":20128" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo       Sudah berjalan.
) else (
    echo       Belum jalan. Dibuka di jendela baru...
    start "9Router" cmd /k "%~dp0start-9router.bat"
)

echo [4/6] Memeriksa MoneyPrinterTurbo - footage stok asli, port 8080...
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo       Sudah berjalan.
) else (
    if exist "MoneyPrinterTurbo\main.py" (
        echo       Belum jalan. Dibuka di jendela baru, siap dipakai setelah selesai memuat...
        start "MoneyPrinterTurbo" cmd /k "%~dp0start-moneyprinter.bat"
    ) else (
        echo       Belum terpasang, dilewati. Sumber video "Template FFmpeg" tetap bisa dipakai.
        echo       Kalau mau footage stok asli, jalankan start-moneyprinter.bat sekali untuk memasangnya.
    )
)

echo [5/6] Browser dibuka otomatis begitu tampilan siap...
rem Kesiapan dicek lewat permintaan HTTP, bukan koneksi ke 127.0.0.1: Vite hanya
rem mendengarkan di alamat IPv6 [::1], jadi tes ke 127.0.0.1 selalu ditolak.
start "" /min powershell -NoProfile -Command "for ($i=0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 3 | Out-Null; Start-Process 'http://localhost:5173'; break } catch { Start-Sleep -Milliseconds 800 } }"

echo [6/6] Menjalankan backend port 3001 dan frontend port 5173...
echo.
echo -------------------------------------------------------------------------
echo   Aplikasi        : http://localhost:5173
echo   Backend         : http://localhost:3001
echo   9Router         : http://localhost:20128
echo   MoneyPrinter    : http://127.0.0.1:8080
echo.
echo   Biarkan jendela ini terbuka selama memakai aplikasi.
echo   Tekan Ctrl+C untuk menghentikan, atau jalankan restart.bat untuk mulai ulang.
echo -------------------------------------------------------------------------
echo.

npm run dev
