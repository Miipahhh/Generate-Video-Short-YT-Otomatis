@echo off
title AI Shorts Studio - 9Router
color 0B

echo =========================================================================
echo                       MENJALANKAN 9ROUTER (AI LOKAL)
echo =========================================================================
echo.

where 9router >nul 2>nul
if %errorlevel% neq 0 (
    echo 9Router belum terinstall di komputer ini. Menginstall lewat npm...
    echo Butuh Node.js versi 18 ke atas sudah terpasang.
    echo.
    call npm install -g 9router
    echo.
    echo Instalasi selesai.
    echo.
)

echo Menjalankan 9Router di http://localhost:20128
echo.
echo PENTING:
echo  - Biarkan jendela ini tetap terbuka selama memakai AI Shorts Studio.
echo  - Buka http://localhost:20128 di browser untuk dashboard 9Router
echo    (hubungkan provider AI di sana kalau belum pernah).
echo  - Tutup jendela ini akan memutus koneksi AI Shorts Studio ke 9Router.
echo.

9router
