# AI Shorts Studio — 9Router & Hermes AI

Aplikasi web (React + Express) untuk membuat video Shorts vertikal (9:16) secara otomatis: AI meracik naskah, judul, deskripsi, tag, lalu FFmpeg merender video MP4, lalu diupload ke Facebook Page, dan sistem penjadwal (cron) bisa menjalankan seluruh alur ini otomatis 3x seminggu.

## Fitur

- **Studio AI** — generate judul viral, deskripsi SEO, tag, dan naskah narasi per-scene lewat model AI (9Router/OpenRouter, kompatibel format OpenAI Chat Completions), dengan fallback konten offline kalau API tidak terjangkau.
- **Render video 9:16** — dua mode: template FFmpeg (background bertema + teks caption/narasi, gratis & instan) atau **AI Video sungguhan** via fal.ai (visual digenerate AI sesuai topik/scene, berbayar per detik).
- **Scheduler otomatis** — cron job (Senin/Rabu/Jumat 18:00 WIB) mengambil topik teratas dari antrean dan menjalankan alur generate → cek keamanan konten → render → upload tanpa campur tangan manual. Antrean mulai kosong; kalau kosong saat jadwal tiba, topik diminta ke AI. Status auto-pilot, antrean, dan riwayat eksekusi ikut tersimpan di `server/data/database.json`, jadi tidak hilang saat server di-restart.
- **Cek keamanan konten** — sebelum auto-pilot upload otomatis, AI menilai naskah terhadap risiko pelanggaran community guideline (ujaran kebencian, misinformasi berbahaya, dll). Kalau berisiko, upload otomatis dibatalkan (videonya tetap masuk Riwayat buat direview manual).
- **Riwayat** — semua short yang dibuat tersimpan permanen di `server/data/database.json`.
- **Pengaturan** — endpoint/API key AI, kredensial Facebook Page, sumber video, dan narator suara diatur lewat tab Pengaturan di UI, tersimpan lokal.

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

Salin `.env.example` ke `.env` bila ingin mengganti port backend (`PORT`). Konfigurasi AI provider dan Facebook Page **tidak** lewat `.env` — diisi lewat tab Pengaturan di aplikasi dan disimpan ke `server/data/database.json` (file ini di-gitignore karena berisi API key & token asli, jangan pernah dikomit).

## Menghubungkan Upload Otomatis ke Facebook Page

Aplikasi upload video sungguhan ke Facebook Page lewat Graph API (bukan simulasi). Beda dari YouTube (yang butuh alur OAuth redirect penuh di dalam aplikasi), Facebook Page pakai model yang lebih sederhana: Anda generate **Page Access Token** sendiri dari Meta for Developers, lalu tempel langsung di Pengaturan — tidak ada redirect di aplikasi ini.

Langkah setup di **Meta for Developers** (harus dilakukan sendiri oleh admin Page):

1. Buka [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → pilih tipe **Business** → beri nama bebas.
2. Di dashboard App, tambahkan produk **Facebook Login** (untuk generate token) dan pastikan App terhubung ke Page yang mau dipakai (App Settings → Basic, atau lewat Business Manager kalau Page ada di situ).
3. Buka **Graph API Explorer** ([developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)):
   - Pilih App yang baru dibuat di dropdown atas.
   - Pilih **User Token** dulu, klik **"Get Token" → "Get User Access Token"**, centang izin `pages_manage_posts` dan `pages_read_engagement`, lalu Generate Token.
   - Ganti dropdown dari **User Token** ke **Page Access Token**, pilih Page yang mau dipakai — Graph API Explorer otomatis menukar jadi token milik Page tersebut.
   - (Opsional tapi disarankan) Tukar jadi token **long-lived** (tidak kedaluwarsa dalam hitungan jam) lewat endpoint `GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}` — detail lengkap di [dokumentasi resmi Meta](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived).
4. Salin **Page ID** (terlihat di halaman "About" Page Facebook Anda, atau dari respons token di atas) dan **Page Access Token** yang dihasilkan.
5. Buka tab **Pengaturan** aplikasi ini → bagian **Facebook Page** → tempel Page ID & Page Access Token → klik **Cek koneksi** untuk memastikan valid → **Simpan**.
6. Status di Pengaturan berubah jadi "Terhubung" begitu Page ID & token terisi. Upload berikutnya (manual maupun via scheduler) akan benar-benar terkirim ke Page tersebut.

Kalau ingin memutus koneksi (kembali ke mode simulasi/Sandbox), klik **"Putuskan koneksi"** di tab Pengaturan.

**Catatan penting:**

- Video vertikal (9:16) durasi pendek yang diupload otomatis ikut disurface di tab Reels Facebook — tidak perlu setup terpisah untuk itu.
- Facebook Page tidak punya privasi granular seperti YouTube (private/unlisted) — pilihan di Studio cuma "Simpan lokal saja", "Upload sebagai draft" (belum tayang, publish manual nanti dari Meta Business Suite), atau "Upload & langsung tayang".
- Kalau token kedaluwarsa (Facebook App masih mode Development, token pendek umurnya), upload akan gagal dengan pesan jelas di Riwayat — generate token baru dan simpan ulang.
- Integrasi YouTube (kode & endpoint-nya) sengaja dibiarkan ada di `server/services/youtubeService.js`, tidak dihapus — kalau suatu saat ingin beralih balik atau upload ke dua platform sekaligus, tinggal disambungkan lagi.

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
- Kalau server MoneyPrinterTurbo mati, timeout, atau gagal generate, render **gagal dengan pesan jelas** (bukan diam-diam fallback ke template FFmpeg) — kalau mode ini yang dipilih, memang footage video asli yang diinginkan, bukan hasil beda diam-diam.
- Jendela `start-moneyprinter.bat` harus tetap terbuka selama memakai mode ini — menutupnya memutus koneksi.
- Topik tentang orang/tokoh tertentu (atlet, artis, dll) **tidak akan menampilkan wajah orang itu** — Pexels/Pixabay adalah stok footage generik, tidak punya rekaman orang-orang tertentu (butuh izin/model release yang tidak pernah ditandatangani tokoh publik). Sistem otomatis menyusun kata kunci pencarian yang generik/bebas nama supaya visualnya tetap related secara suasana, tapi untuk wajah sungguhan lihat bagian **Footage Sendiri** di bawah.

### Footage Sendiri (Video Milik Anda Sendiri)

Kalau perlu video yang benar-benar menampilkan orang/momen spesifik (yang tidak mungkin didapat dari stok Pexels/Pixabay), Anda bisa upload footage sendiri untuk dipakai menggantikan pencarian stok otomatis — naskah, sintesis suara, subtitle, dan potong-sambung video **tetap sepenuhnya otomatis** seperti biasa, cuma sumber visualnya yang berubah.

Cara pakai:

1. Di tab **Studio**, pilih provider video **MoneyPrinterTurbo** dulu di Pengaturan (fitur ini khusus mode itu).
2. Di kartu naskah, aktifkan togel **"Pakai footage saya sendiri"**.
3. Klik **Upload footage**, pilih video (mp4/mov/webm/mkv/avi, maks 500MB/file) — pastikan Anda memang punya hak pakai footage tersebut.
4. Centang klip yang mau dipakai, atur urutannya dengan tombol panah (urutan ini menentukan urutan klip ditempel ke timeline, sebaiknya ikuti alur cerita naskah).
5. Render seperti biasa — MoneyPrinterTurbo memotong & menyusun klip Anda sesuai durasi tiap adegan, lalu membakar subtitle & suara narator di atasnya.

**Catatan penting:**

- Sistem **tidak "paham isi" video** secara cerdas — dia cuma memotong klip sesuai jatah durasi per adegan, tidak otomatis mendeteksi "momen penting"-nya. Sebaiknya siapkan klip pendek yang memang sudah relevan (satu-dua klip per adegan naskah), bukan rekaman mentah berdurasi panjang.
- File disimpan di `MoneyPrinterTurbo/storage/local_videos/` (butuh MoneyPrinterTurbo sudah ter-install lewat `start-moneyprinter.bat`).
- Kalau togelnya aktif tapi tidak ada klip yang dicentang, render otomatis jatuh kembali ke pencarian stok biasa.

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

## Fakta Terkini (Pencarian Web)

AI naskah (Hermes/9Router) murni model bahasa — cuma tahu apa yang ada di data latihannya, tidak bisa browsing internet. Untuk topik yang butuh info terbaru (kejadian baru, prestasi terkini seorang tokoh, dll), ini bisa bikin naskah salah atau ketinggalan zaman. Fitur ini opsional: menyuntik hasil pencarian web asli lewat [Tavily](https://tavily.com) (API pencarian yang dirancang khusus buat grounding AI/RAG, gratis 1.000 pencarian/bulan tanpa kartu kredit) ke prompt AI, baik saat generate naskah maupun cek fakta.

Cara aktifkan:

1. Daftar akun gratis di [app.tavily.com](https://app.tavily.com), salin API key (`tvly-...`).
2. Buka tab **Pengaturan** → panel **Fakta terkini (pencarian web)** → aktifkan togelnya → tempel API key → **Simpan**.
3. Generate short seperti biasa — kalau topiknya bukan cerita fiksi murni, aplikasi otomatis mencari topik itu di web dulu, hasilnya disuntikkan sebagai konteks ke prompt AI supaya naskahnya berdasar fakta aktual. Label "AI naskah" di kartu hasil akan menyebut "+ fakta web (Tavily)" kalau konteks pencarian berhasil dipakai.
4. Tombol **Cek fakta** juga ikut memakai konteks pencarian yang sama untuk menilai klaim, jadi hasilnya lebih akurat daripada cuma mengandalkan pengetahuan model — disclaimer di UI otomatis menyesuaikan tergantung apakah pencarian web dipakai atau tidak.

Kalau dinonaktifkan, API key kosong, atau pencarian gagal (quota habis, timeout, dll), generate & cek fakta tetap jalan seperti biasa tanpa konteks tambahan — proses tidak akan macet.

## Keterbatasan yang Diketahui

- Video di-upload sebagai *unlisted/public/private* sesuai pilihan di Studio, dengan kategori tetap "Science & Technology" (categoryId 22) — belum ada UI untuk memilih kategori lain.
- Background gambar diambil dari [Picsum Photos](https://picsum.photos) (gambar acak, bukan hasil pencarian sesuai tema/kata kunci).
- Refresh token OAuth hanya diberikan Google pada consent pertama; kalau Anda mencabut akses aplikasi ini dari [myaccount.google.com/permissions](https://myaccount.google.com/permissions), Anda perlu klik "Hubungkan dengan Google" ulang.

## Struktur Proyek

```
server/           Express backend
  server.js       Definisi semua endpoint REST
  services/       aiService, videoRendererService, aiVideoService, renderOrchestrator,
                   facebookService, youtubeService (dormant), schedulerService, ttsService,
                   dbService, searchService, moneyPrinterService, footageService
  data/           database.json (persisten, gitignored)
src/              Frontend React (Vite)
  index.css       Design system (token warna light/dark + komponen dasar)
  components/     DashboardView, ShortsStudioView, SchedulerView, HistoryView, SettingsView
  components/ui/  ToastHost, ConfirmHost, VideoPreviewModal
public/videos/    Output video MP4 hasil render + font
```
