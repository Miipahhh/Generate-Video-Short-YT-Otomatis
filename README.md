# 🎬 AI Shorts Studio

Aplikasi web (React + Express) yang berjalan secara lokal untuk mengotomatisasi seluruh alur pembuatan video Shorts vertikal (9:16) dari teks hingga siap di-upload ke Facebook Page. Dengan bantuan AI untuk meracik naskah & metadata, sistem merender video dengan berbagai opsi, membacakan naskah dengan narator AI, dan menjadwalkan upload secara otomatis tanpa campur tangan manual.

## ✨ Fitur Utama

- **🧠 Studio AI Pintar**: Generate judul viral, deskripsi SEO, tag, dan naskah per-scene lewat model AI (menggunakan 9Router/OpenRouter) dengan fallback ke generator lokal jika AI tidak terjangkau.
- **🎥 3 Mode Render Video**:
  1. **Template FFmpeg**: Background bertema + teks caption & narasi dibakar otomatis (Gratis & Instan).
  2. **AI Video (fal.ai)**: Visual digenerate murni oleh AI sesuai topik per-scene (Berbayar per detik, fallback ke template bila gagal).
  3. **MoneyPrinterTurbo**: Memakai footage video stok asli (Pexels/Pixabay) yang disesuaikan dengan naskah, ditambah subtitle & TTS otomatis (Dijalankan via project terpisah).
- **🎙️ Narator Suara AI (TTS)**: Membacakan naskah menggunakan suara neural (Gadis/Ardi untuk ID asli, atau multilingual) secara gratis menggunakan `edge-tts-universal`.
- **🌐 Fakta Terkini & Pengecekan Fakta**: Menyuntikkan konteks pencarian web aktual (via Tavily) ke naskah AI, serta mengecek dan merevisi klaim faktual secara otomatis.
- **🛡️ Cek Keamanan Konten**: AI akan menilai risiko pelanggaran community guidelines sebelum mengunggah secara otomatis.
- **📅 Auto-Pilot (Scheduler)**: Cron job (default: Senin/Rabu/Jumat 18:00 WIB) mengambil topik dari antrean, men-generate, merender, dan meng-upload secara otomatis ke Facebook.
- **📚 Manajemen Riwayat & Pengaturan Terpusat**: Semua history short dan konfigurasi (API Keys, Pages, dll) tersimpan rapi dan persisten.

## 🚀 Prasyarat

- **Node.js 18+**
- **FFmpeg** dan **curl** harus tersedia di PATH sistem.
- *(Opsional)* Python 3.11+ dan Git jika ingin menggunakan mode `MoneyPrinterTurbo`.

## 🛠️ Instalasi & Cara Menjalankan

1. Clone repositori ini dan masuk ke folder proyek.
2. Install dependensi:
   ```bash
   npm install
   ```
3. Salin file `.env.example` ke `.env` jika ingin mengubah port (opsional).
4. **Jalankan aplikasi (Windows):**
   Gunakan script bawaan agar otomatis menangani 9Router:
   ```bash
   start.bat
   # atau untuk me-restart: restart.bat
   ```
   *Atau jalankan secara manual:*
   ```bash
   npm run dev
   ```

Aplikasi bisa diakses di browser melalui `http://localhost:5173`.

> **💡 Catatan**: `start.bat` akan otomatis menjalankan backend (port 3001) dan frontend (port 5173), serta memastikan `9Router` berjalan di port 20128.

## ⚙️ Konfigurasi Eksternal

Sebagian besar fitur tingkat lanjut memerlukan API Key atau konfigurasi pihak ketiga yang bisa diatur lewat **Tab Pengaturan** di UI aplikasi:

- **AI Utama (9Router)**: Berjalan otomatis lewat `start.bat`. Pastikan telah menghubungkan API provider (misal OpenRouter) di `http://localhost:20128`.
- **Facebook Page Upload**: Anda harus men-generate **Page Access Token** dari Meta for Developers dengan izin `pages_manage_posts` & `pages_read_engagement` untuk bisa mengunggah video secara otomatis.
- **Video AI (fal.ai)**: Untuk render AI generatif. Daftar di fal.ai dan masukkan API Key-nya.
- **Tavily (Pencarian Web)**: Daftar gratis di app.tavily.com untuk menyuntikkan data real-time pada naskah.

## 📂 Struktur Proyek

```text
ai-shorts-studio/
├── server/               # Express backend (Endpoint REST, Integrasi AI, Scheduler, dsb.)
│   ├── services/         # Logic inti untuk AI, video render, upload FB, dan DB
│   └── data/             # database.json (Penyimpanan persisten config & history)
├── src/                  # Frontend React (Vite)
│   ├── components/       # UI Dashboard, Studio, Scheduler, History, Settings
│   └── lib/              # State management & hooks (Zustand/Context)
├── public/videos/        # Output hasil render video MP4 & Font
└── MoneyPrinterTurbo/    # (Opsional) Di-clone saat menjalankan start-moneyprinter.bat
```

## 🤝 Kontribusi & Keterbatasan

- Semua data sensitif tersimpan di `server/data/database.json` dan tidak di-track Git.
- Fitur upload saat ini difokuskan pada Facebook Page. Kode untuk YouTube telah disiapkan (`youtubeService.js`) namun bersifat tidak aktif (dormant).
- Video Template FFmpeg masih menggunakan musik backsound sintetis, belum sepenuhnya mood-matching seperti mode MoneyPrinterTurbo.

---
Dibuat untuk mempermudah produksi konten secara otomatis & berkualitas! 🚀
