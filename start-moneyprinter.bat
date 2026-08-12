@echo off
title AI Shorts Studio - MoneyPrinterTurbo
color 0D

rem CATATAN PENTING soal penulisan file ini:
rem Di batch, tanda ^& memisahkan perintah dan tanda kurung menutup blok if. Kalau dipakai
rem polos di dalam echo, skrip ini gagal dengan pesan aneh semacam "'audio' is not
rem recognized" atau "belum was unexpected at this time" sebelum sempat menjalankan apa pun.
rem Jadi teks di bawah sengaja menghindari kedua tanda itu, atau memakai ^ untuk meloloskannya.

echo =========================================================================
echo              MENJALANKAN MONEYPRINTERTURBO - FOOTAGE STOK ASLI
echo =========================================================================
echo.
echo MoneyPrinterTurbo adalah project Python terpisah dari github.com/harry0703/MoneyPrinterTurbo
echo yang dipakai AI Shorts Studio untuk mencocokkan naskah dengan footage video stok
echo asli dari Pexels atau Pixabay, lalu membakar subtitle dan audio TTS otomatis.
echo.

set MPT_DIR=%~dp0MoneyPrinterTurbo

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [GAGAL] Git belum terinstall. Install dulu dari https://git-scm.com/downloads
    pause
    exit /b 1
)

where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo [GAGAL] uv - package manager Python - belum terinstall.
    echo Install dulu lewat PowerShell:
    echo    irm https://astral.sh/uv/install.ps1 ^| iex
    echo Detail: https://docs.astral.sh/uv/getting-started/installation/
    pause
    exit /b 1
)

if not exist "%MPT_DIR%" (
    echo MoneyPrinterTurbo belum ada di %MPT_DIR%. Meng-clone repo...
    git clone https://github.com/harry0703/MoneyPrinterTurbo.git "%MPT_DIR%"
    echo.
)

cd /d "%MPT_DIR%"

if not exist "config.toml" (
    echo Membuat config.toml dari template...
    copy config.example.toml config.toml >nul
    echo.
    echo [PENTING] Buka MoneyPrinterTurbo\config.toml lalu isi minimal SATU dari:
    echo    - pexels_api_keys  -^> gratis di https://www.pexels.com/api/
    echo    - pixabay_api_keys -^> gratis di https://pixabay.com/api/docs/
    echo Tanpa itu, MoneyPrinterTurbo tidak bisa mengambil footage video stok.
    echo.
    echo Tekan tombol apa saja setelah selesai mengisi config.toml...
    pause >nul
)

echo Menyiapkan environment Python lewat uv sync...
call uv sync --frozen
if %errorlevel% neq 0 (
    echo uv sync --frozen gagal, mencoba tanpa --frozen...
    call uv sync
)
echo.

echo Menjalankan API server MoneyPrinterTurbo di http://127.0.0.1:8080
echo.
echo PENTING:
echo  - Biarkan jendela ini terbuka selama memakai sumber video MoneyPrinterTurbo
echo    di tab Pengaturan AI Shorts Studio.
echo  - Dokumentasi API: http://127.0.0.1:8080/docs
echo  - Menutup jendela ini memutus koneksi, dan render video akan gagal
echo    dengan pesan "server tidak terjangkau".
echo.

uv run python main.py

echo.
echo Server MoneyPrinterTurbo berhenti. Jendela ini dibiarkan terbuka supaya
echo pesan error terakhir masih bisa dibaca.
pause
