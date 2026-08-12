# AI Shorts Studio — 9Router & Hermes AI

Aplikasi web (React + Express) untuk membuat video YouTube Shorts vertikal (9:16) secara otomatis: AI meracik naskah, judul, deskripsi, tag, lalu FFmpeg merender video MP4, dan sistem penjadwal (cron) bisa menjalankan alur ini otomatis 3x seminggu.

## Fitur

- **Studio AI** — generate judul viral, deskripsi SEO, tag, dan naskah narasi per-scene lewat model AI (9Router/OpenRouter, kompatibel format OpenAI Chat Completions), dengan fallback konten offline kalau API tidak terjangkau.
- **Render video 9:16** — dua mode: template FFmpeg (background bertema + teks caption/narasi, gratis & instan) atau **AI Video sungguhan** via fal.ai (visual digenerate AI sesuai topik/scene, berbayar per detik).
- **Scheduler otomatis** — cron job (Senin/Rabu/Jumat 18:00 WIB) mengambil topik teratas dari antrean dan menjalankan alur generate → render → upload tanpa campur tangan manual. Antrean mulai kosong; kalau kosong saat jadwal tiba, topik diminta ke AI. Status auto-pilot & antrean ikut tersimpan di `server/data/database.json`, jadi tidak hilang saat server di-restart.
- **Riwayat** — semua short yang dibuat tersimpan permanen di `server/data/database.json`.
- **Pengaturan** — endpoint/API key AI, kredensial YouTube OAuth, sumber video, dan narator suara diatur lewat tab Pengaturan di UI, tersimpan lokal.

## Prasyarat

- Node.js 18+
- **FFmpeg** dan **curl** harus tersedia di PATH sistem (dipakai untuk render video & download gambar background).

## Instalasi & Menjalankan

```bash
npm install
npm run dev       # menjalankan backend (port 3001) + frontend Vite (port 5173) bersamaan
```

Atau di Windows, jalankan `start.bat` (mulai baru) / `restart.bat` (matikan proses node lalu jalankan ulang). Kedua script ini sekarang otomatis mengecek dan menjalankan 9Router juga (lihat bagian di bawah) — tidak perlu dijalankan manual terpisah.

Buka `http://localhost:5173` di browser.

Script lain:

- `npm run server` — jalankan backend saja
- `npm run dev:client` — jalankan frontend saja
- `npm run build` — build produksi frontend ke `dist/`
- `npm run lint` — jalankan Oxlint
- `start-9router.bat` — install (kalau belum ada) dan jalankan 9Router secara manual/terpisah

## Menghubungkan AI Utama (9Router)

Studio AI butuh 9Router jalan di komputer Anda supaya bisa generate naskah pakai model AI sungguhan (bukan generator cadangan lokal). 9Router adalah proxy AI open-source gratis yang jalan lokal di `http://localhost:20128`.

**Cara paling gampang (Windows):** jalankan `start.bat` atau `restart.bat` seperti biasa — keduanya sekarang otomatis mengecek apakah 9Router sudah jalan di port 20128, dan kalau belum, otomatis membuka jendela baru yang menginstall (kalau perlu, via `npm install -g 9router`) lalu menjalankannya. Jendela itu harus dibiarkan tetap terbuka selama memakai aplikasi.

**Kalau mau jalankan manual atau di luar Windows:**

1. Install: `npm install -g 9router` (butuh Node.js 18+), atau lewat Docker: `docker run -d --name 9router -p 20128:20128 -v 9router-data:/app/data decocua/9router:latest`.
2. Jalankan: `9router` — biarkan tetap berjalan di background/terminal terpisah.
3. Buka `http://localhost:20128` di browser untuk dashboard 9Router — di situ hubungkan provider AI (API key OpenRouter dll).
4. Di tab **Pengaturan** aplikasi ini, Base API URL sudah default ke `http://localhost:20128/v1` dan model `hermes` — kalau endpoint-nya localhost, aplikasi otomatis anggap tidak perlu API key terpisah.

Kalau naskah yang di-generate selalu menampilkan banner kuning "AI utama tidak terjangkau, pakai Smart Generator Lokal", berarti 9Router belum/berhenti jalan — cek jendela terminalnya masih terbuka atau tidak.

## Konfigurasi

Salin `.env.example` ke `.env` bila ingin mengganti port backend (`PORT`). Konfigurasi AI provider dan YouTube OAuth **tidak** lewat `.env` — diisi lewat tab Pengaturan di aplikasi dan disimpan ke `server/data/database.json` (file ini di-gitignore karena berisi API key & client secret asli, jangan pernah dikomit).

## Menghubungkan Upload Asli ke YouTube (OAuth)

Sejak update ini, aplikasi bisa upload video sungguhan ke YouTube Shorts lewat YouTube Data API v3 (bukan simulasi lagi), dengan alur OAuth 2.0 penuh (authorization code + refresh token + resumable upload). Langkah setup di **Google Cloud Console** (harus dilakukan sendiri oleh pemilik akun Google/channel):

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project baru (atau pakai yang sudah ada).
2. Aktifkan **YouTube Data API v3** di menu "APIs & Services > Library".
3. Di "APIs & Services > OAuth consent screen": buat consent screen (External, mode Testing cukup), tambahkan email Anda sebagai **Test user**, dan tambahkan scope `youtube.upload` & `youtube.readonly`.
4. Di "APIs & Services > Credentials": buat **OAuth Client ID** tipe **Web application**.
5. Di kolom **Authorized redirect URIs**, tambahkan persis:
   ```
   http://localhost:5173/api/youtube/oauth/callback
   ```
6. Salin **Client ID** dan **Client Secret** yang dihasilkan, tempel di tab **Pengaturan** aplikasi ini (bagian YouTube), lalu klik "Simpan Client ID & Secret".
7. Klik **"Hubungkan dengan Google"** — Anda akan diarahkan ke halaman login Google, pilih akun/channel yang mau dipakai, setujui izin upload.
8. Setelah berhasil, status di Pengaturan berubah jadi "Terhubung" dan mode otomatis pindah ke `PRODUCTION`. Upload berikutnya (manual maupun via scheduler) akan benar-benar terkirim ke channel tersebut.

Kalau ingin memutus koneksi (kembali ke mode simulasi/Sandbox), klik **"Putuskan Koneksi Google"** di tab Pengaturan.

> Jika `PORT` backend atau URL frontend diubah dari default, sesuaikan juga redirect URI lewat env var `YOUTUBE_OAUTH_REDIRECT_URI` di `.env` — dan pastikan nilainya persis sama dengan yang didaftarkan di Google Cloud Console.

## Video Digenerate AI Sungguhan (fal.ai)

Selain template FFmpeg, aplikasi ini bisa membuat visual video hasil AI generation asli (bukan cuma teks di atas background) lewat [fal.ai](https://fal.ai) — satu API key untuk akses banyak model video (Wan, Kling, Veo, dll).

Cara aktifkan:

1. Daftar akun di [fal.ai](https://fal.ai) (dapat **$20 kredit gratis** saat signup, tanpa perlu kartu kredit dulu).
2. Buka [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) → generate API Key → salin.
3. Buka tab **Pengaturan** aplikasi → bagian **Video Generator** → pilih **"AI Video (fal.ai)"** → tempel API Key → **Simpan**.
4. Generate short seperti biasa di Studio AI — video akan otomatis dibuat lewat fal.ai, bukan template lagi.

Model default: **`wan/v2.6/text-to-video`** (~$0.05/detik, termurah). Bisa diganti ke model fal.ai lain (misal Kling 3.0 untuk motion lebih halus, ~$0.07-0.10/detik) dengan mengetik Model ID-nya langsung di kolom "Model ID" — lihat daftar model di [fal.ai/models](https://fal.ai/models) (cari kategori "Text to Video").

**Keterbatasan penting mode AI Video:**

- Model Wan 2.6 hanya mendukung durasi **5, 10, atau 15 detik** — jauh lebih pendek dari naskah penuh (~30-40 detik) yang dibuat Hermes AI. Durasi otomatis dibulatkan ke salah satu dari itu, dan visual per-scene dikompres proporsional ke durasi yang lebih pendek.
- Proses generate **asinkron & lambat** (30 detik sampai beberapa menit per video), beda jauh dari template FFmpeg yang instan.
- Kalau generate AI gagal (kuota habis, timeout, model error), sistem otomatis **fallback ke template FFmpeg** supaya proses tidak macet — cek `uploadMode`/log server kalau video yang keluar terasa beda dari ekspektasi.

## Video dengan Footage Stok Asli (MoneyPrinterTurbo)

Selain template FFmpeg dan AI Video (fal.ai), aplikasi ini juga bisa memakai [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — project open-source Python yang mencocokkan naskah narasi kita dengan footage video stok **asli** (Pexels/Pixabay), lalu membakar subtitle dan audio TTS secara otomatis. Beda dari fal.ai (yang men-generate visual dari nol pakai AI), mode ini memakai rekaman video sungguhan yang relevan dengan topik.

MoneyPrinterTurbo **bukan** library yang ikut ter-install lewat `npm install` — dia project Python mandiri dengan API server sendiri, jadi harus dijalankan terpisah di komputer yang sama.

Cara aktifkan:

1. **Install prasyarat** (sekali saja): [Git](https://git-scm.com/downloads), [Python 3.11+](https://www.python.org/downloads/), dan [`uv`](https://docs.astral.sh/uv/getting-started/installation/) (`powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`).
2. Jalankan **`start-moneyprinter.bat`** — otomatis meng-clone repo MoneyPrinterTurbo ke folder `MoneyPrinterTurbo/` di sebelah project ini, menyalin `config.toml`, menyiapkan environment Python (`uv sync`), lalu menjalankan API server-nya di `http://127.0.0.1:8080`.
3. **Isi API key footage** di `MoneyPrinterTurbo\config.toml` — minimal salah satu dari `pexels_api_keys` (gratis di [pexels.com/api](https://www.pexels.com/api/)) atau `pixabay_api_keys` (gratis di [pixabay.com/api/docs](https://pixabay.com/api/docs/)). Tanpa ini MoneyPrinterTurbo tidak bisa mengambil footage.
4. Buka tab **Pengaturan** aplikasi → bagian **Video Generator** → pilih **"MoneyPrinterTurbo (Footage Stok Asli)"** → klik **Cek Koneksi** untuk memastikan server-nya terjangkau → **Simpan**.
5. Generate short seperti biasa di Studio AI — naskah dari Hermes AI dikirim langsung ke MoneyPrinterTurbo (jadi bukan MoneyPrinterTurbo yang menulis skrip, cuma yang mencari footage + render), video hasilnya diunduh otomatis ke folder lokal aplikasi.

**Keterbatasan penting mode ini:**

- Proses jauh lebih lambat dari template FFmpeg — mencari & mengunduh footage stok, sintesis suara, dan membakar subtitle bisa makan waktu 1-5 menit per video, tergantung kecepatan koneksi dan panjang naskah.
- Kualitas hasil bergantung pada relevansi footage stok yang ditemukan Pexels/Pixabay untuk kata kunci topik — untuk topik yang sangat spesifik/niche, footage yang cocok mungkin terbatas.
- Kalau server MoneyPrinterTurbo mati, timeout, atau gagal generate, sistem otomatis **fallback ke template FFmpeg** supaya proses tidak macet.
- Jendela `start-moneyprinter.bat` harus tetap terbuka selama memakai mode ini — menutupnya memutus koneksi.

## Narator Suara AI (Text-to-Speech)

Naskah narasi yang dibuat Studio AI sekarang bisa dibacakan jadi suara asli (bukan cuma teks caption di layar), pakai suara neural Bahasa Indonesia bawaan Microsoft Edge — **gratis, tanpa API key, tanpa signup**. Berlaku di kedua mode render (template FFmpeg maupun AI Video/fal.ai).

Cara pakai:

1. Buka tab **Pengaturan** → panel **Narator suara**.
2. Pastikan togel narator aktif (aktif secara default).
3. Pilih suara, kecepatan, dan nada. Ada dua kelompok suara:
   - **Gadis / Ardi** — suara `id-ID` asli, pelafalan Indonesianya paling benar.
   - **Ava / Emma / Andrew / Brian** — suara *multilingual* generasi baru, pembawaannya lebih luwes dan mengalir, tapi ada sedikit logat asing.
4. Klik **Dengar contoh** untuk mendengar kalimat pendek dengan setelan itu sebelum disimpan, lalu **Simpan**.
5. Generate short seperti biasa — audio video akan berupa pembacaan naskah narasi asli, dan durasi video otomatis menyesuaikan panjang suaranya (bukan angka default).

Sebelum disintesis, teks narasi dirapikan otomatis (emoji & hashtag dibuang, KAPITAL SEMUA diturunkan, tanda seru bertubi-tubi dipangkas, spasi setelah tanda baca dirapikan) supaya intonasinya tidak kaku atau terdengar berteriak. Perapian ini juga berlaku untuk naskah yang dikirim ke MoneyPrinterTurbo, yang mensintesis suaranya sendiri.

Kalau dinonaktifkan, atau kalau sintesis suara gagal karena sebab apa pun, video tetap dibuat dengan audio ambient placeholder seperti sebelumnya (bukan sintesis suara) — proses render tidak akan macet.

**Catatan penting:** fitur ini memakai [`edge-tts-universal`](https://www.npmjs.com/package/edge-tts-universal), library open-source yang memanfaatkan endpoint suara "Read Aloud" milik Microsoft Edge secara *tidak resmi* (reverse-engineered, bukan API resmi berbayar). Ini berarti: tidak butuh API key/biaya, tapi juga tidak dijamin Microsoft — kalau mereka mengubah sesuatu di sisi server, fitur ini bisa berhenti berfungsi sampai library-nya diperbarui.

## Keterbatasan yang Diketahui

- Video di-upload sebagai *unlisted/public/private* sesuai pilihan di Studio, dengan kategori tetap "Science & Technology" (categoryId 22) — belum ada UI untuk memilih kategori lain.
- Background gambar diambil dari [Picsum Photos](https://picsum.photos) (gambar acak, bukan hasil pencarian sesuai tema/kata kunci).
- Refresh token OAuth hanya diberikan Google pada consent pertama; kalau Anda mencabut akses aplikasi ini dari [myaccount.google.com/permissions](https://myaccount.google.com/permissions), Anda perlu klik "Hubungkan dengan Google" ulang.

## Struktur Proyek

```
server/           Express backend
  server.js       Definisi semua endpoint REST
  services/       aiService, videoRendererService, aiVideoService, renderOrchestrator,
                   youtubeService, schedulerService, ttsService, dbService
  data/           database.json (persisten, gitignored)
src/              Frontend React (Vite)
  index.css       Design system (token warna light/dark + komponen dasar)
  components/     DashboardView, ShortsStudioView, SchedulerView, HistoryView, SettingsView
  components/ui/  ToastHost, ConfirmHost, VideoPreviewModal
public/videos/    Output video MP4 hasil render + font
```
