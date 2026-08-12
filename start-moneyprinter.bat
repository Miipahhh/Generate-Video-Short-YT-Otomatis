@echo off
title AI Shorts Studio - MoneyPrinterTurbo
color 0D

echo =========================================================================
echo              MENJALANKAN MONEYPRINTERTURBO (FOOTAGE STOK ASLI)
echo =========================================================================
echo.
echo MoneyPrinterTurbo adalah project Python terpisah (github.com/harry0703/MoneyPrinterTurbo)
echo yang dipakai AI Shorts Studio untuk mencocokkan naskah dengan footage video stok
echo asli (Pexels/Pixabay), lalu membakar subtitle & audio TTS otomatis.
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
    echo [GAGAL] "uv" (Python package manager) belum terinstall.
    echo Install dulu: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
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
    echo [PENTING] Buka MoneyPrinterTurbo\config.toml dan isi minimal SATU dari:
    echo   - pexels_api_keys  (gratis: https://www.pexels.com/api/)
    echo   - pixabay_api_keys (gratis: https://pixabay.com/api/docs/)
    echo Tanpa ini, MoneyPrinterTurbo tidak bisa mengambil footage video stok.
    echo.
    echo Tekan tombol apa saja setelah selesai mengisi config.toml...
    pause >nul
)

echo Menyiapkan environment Python (uv sync)...
call uv sync --frozen
if %errorlevel% neq 0 (
    echo uv sync --frozen gagal, mencoba tanpa --frozen...
    call uv sync
)
echo.

echo Menjalankan API server MoneyPrinterTurbo di http://127.0.0.1:8080
echo.
echo PENTING:
echo  - Biarkan jendela ini tetap terbuka selama memakai provider "MoneyPrinterTurbo"
echo    di tab Pengaturan API AI Shorts Studio.
echo  - Dokumentasi API: http://127.0.0.1:8080/docs
echo  - Tutup jendela ini akan memutus koneksi AI Shorts Studio ke MoneyPrinterTurbo
echo    (video generation otomatis jatuh ke Template FFmpeg sebagai cadangan).
echo.

uv run python main.py
