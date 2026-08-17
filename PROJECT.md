# AI Shorts Studio — 9Router & Hermes AI

Dokumentasi lengkap project ini: apa yang dibuat, bagaimana cara kerjanya, apa yang sudah dibenerin, dan apa yang masih perlu dikerjakan. Untuk panduan instalasi/setup langkah-demi-langkah, lihat [README.md](README.md) — dokumen ini fokus ke gambaran besar & status project.

## Ringkasan

Aplikasi web personal (React + Express, jalan lokal di Windows) yang mengotomatisasi seluruh alur pembuatan video Shorts vertikal (9:16) untuk Facebook Page: AI meracik naskah & metadata, sistem merender video (tiga pilihan mode), narator AI membacakan naskahnya, lalu video diupload otomatis ke Facebook — baik dipicu manual dari tab Studio, maupun berjalan sepenuhnya tanpa campur tangan lewat scheduler (cron 3x/minggu: Senin/Rabu/Jumat 18:00 WIB).

Filosofi project: **gratis dulu, berbayar opsional**. Semua fitur inti (naskah AI, render, TTS, footage) punya jalur gratis yang jalan tanpa kartu kredit; layanan berbayar (fal.ai, Sonilo) selalu opt-in lewat tab Pengaturan, tidak pernah wajib.

## Fitur Utama

- **Studio AI** — generate judul viral, deskripsi SEO, tag, dan naskah narasi per-scene lewat model AI (9Router lokal, kompatibel format OpenAI Chat Completions), dengan fallback generator lokal kalau AI tidak terjangkau.
- **Tiga mode render video 9:16**:
  1. **Template FFmpeg** — background bertema + teks caption/narasi dibakar otomatis. Gratis, instan.
  2. **AI Video (fal.ai)** — visual digenerate AI sungguhan sesuai topik/scene (model Wan/Kling/dll). Berbayar per detik, fallback otomatis ke Template kalau gagal.
  3. **MoneyPrinterTurbo** — footage stok video *asli* (Pexels/Pixabay) dicocokkan ke naskah, subtitle & TTS dibakar otomatis. Project Python terpisah, dijalankan sendiri via `start-moneyprinter.bat`.
- **Footage sendiri** — untuk topik tentang orang/momen spesifik yang tidak ada di stok Pexels/Pixabay, user bisa upload video sendiri untuk dipakai menggantikan pencarian stok (khusus mode MoneyPrinterTurbo).
- **Narator suara AI (TTS)** — naskah dibacakan pakai suara neural Microsoft Edge (`edge-tts-universal`, gratis tanpa API key). Ada suara Indonesia asli (Gadis/Ardi) dan suara multilingual (Ava/Emma/Andrew/Brian, logat sedikit asing).
- **Backsound sesuai mood niche** *(MoneyPrinterTurbo)* — 29 track bawaan dikelompokkan ke 3 bucket mood (tenang/netral/energik) berdasar analisis akustik nyata (tempo, energi, kecerahan spektral), dipilih otomatis sesuai niche. Niche horor/misteri/konspirasi sengaja dibuat hening total (tidak ada satupun track bawaan yang cocok secara mood).
- **Scheduler otomatis (auto-pilot)** — cron job ambil topik teratas dari antrean, generate → cek keamanan konten → render → upload, tanpa campur tangan manual. Status, antrean, dan riwayat eksekusi tersimpan persisten.
- **Cek keamanan konten** — sebelum auto-pilot upload, AI menilai naskah terhadap risiko pelanggaran community guideline. Kalau berisiko atau gagal dicek (fail-closed), upload otomatis dibatalkan.
- **Cek fakta & revisi otomatis** — AI menilai klaim faktual di naskah (opsional disokong pencarian web Tavily untuk info terkini), lalu bisa merevisi hanya bagian yang bermasalah tanpa menulis ulang naskah dari nol.
- **Fakta terkini (Tavily, opsional)** — menyuntik hasil pencarian web asli ke prompt AI supaya naskah topik yang butuh info terbaru tidak mengarang/ketinggalan zaman.
- **Riwayat** — semua short yang dibuat tersimpan permanen, bisa diputar/diunduh/dihapus (hapus riwayat ikut hapus file MP4-nya).
- **Pengaturan terpusat** — endpoint/API key AI, kredensial Facebook Page, provider video, narator suara, dan pencarian web semua diatur dari satu tab, tersimpan lokal.

## Arsitektur & Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19 + Vite 8, tanpa router (tab-based single page) |
| Backend | Express 5 (Node, ESM) |
| Render video | FFmpeg (dipanggil via child process) |
| AI naskah | 9Router (proxy lokal, `http://localhost:20128`) — kompatibel OpenAI Chat Completions |
| TTS | `edge-tts-universal` (reverse-engineered dari fitur Read Aloud Microsoft Edge) |
| Video stok asli | MoneyPrinterTurbo (Python/FastAPI, project eksternal, port 8080) |
| Video AI generatif | fal.ai (opsional, berbayar) |
| Pencarian web | Tavily (opsional, gratis 1.000 req/bulan) |
| Upload | Facebook Graph API (Page Access Token, generate manual dari Meta for Developers) |
| Penyimpanan data | `server/data/database.json` — flat file JSON, tanpa database sungguhan (skala personal) |
| Scheduler | `node-cron` |

Backend & frontend jalan sebagai dua proses terpisah lewat `concurrently` (`npm run dev`): Express di port 3001, Vite dev server di port 5173 (proxy `/api/*` ke 3001).

## Struktur Proyek

```
server/
  server.js                  Definisi semua endpoint REST + CORS + error handling
  services/
    aiService.js              Generate naskah/judul/tag, cek fakta, revisi naskah,
                               cek keamanan konten, kata kunci video, ide topik acak
    aiVideoService.js          Integrasi fal.ai (AI video generation)
    videoRendererService.js    Render Template FFmpeg (background + caption + audio bed)
    captionRenderer.js         Bantuan render teks caption ke video
    moneyPrinterService.js     Integrasi MoneyPrinterTurbo (footage stok + bgm mood-aware)
    renderOrchestrator.js      Pilih renderer aktif sesuai provider di Pengaturan
    facebookService.js         Upload video ke Facebook Page via Graph API
    youtubeService.js          Integrasi YouTube (dormant, tidak dipakai saat ini)
    schedulerService.js        Cron auto-pilot 3x/minggu + antrean topik + log eksekusi
    ttsService.js               Sintesis suara narator (edge-tts) + perapian teks
    searchService.js            Pencarian web Tavily untuk grounding fakta
    footageService.js           Kelola upload footage video milik user sendiri
    dbService.js                 Baca/tulis server/data/database.json
  data/
    database.json              Semua config + riwayat + antrean scheduler (gitignored)

src/
  App.jsx                     Shell aplikasi + navigasi tab
  index.css                   Design system (token warna light/dark + komponen dasar)
  components/
    DashboardView.jsx          Ringkasan status sistem
    ShortsStudioView.jsx        Alur generate → render → upload manual
    SchedulerView.jsx           Kontrol auto-pilot + antrean topik
    HistoryView.jsx              Daftar semua short yang pernah dibuat
    SettingsView.jsx             Semua pengaturan (AI, video, TTS, Facebook, pencarian)
    ui/
      ProgressBar.jsx, VideoPreviewModal.jsx, ToastHost.jsx, ConfirmHost.jsx, FootagePicker.jsx
  lib/
    studioStore.js              State management alur Studio (generate/render/fact-check)
    useStudioState.js, useProgress.js   Hook pendukung state & progres
    toast.js, confirm.js         Notifikasi & dialog konfirmasi custom

public/videos/                Output video MP4 hasil render + font (isi gitignored)
MoneyPrinterTurbo/             Clone eksternal (git repo sendiri, dikecualikan dari repo ini)
```

## Alur Kerja

### Manual (tab Studio)
1. User isi topik/niche/tone (atau klik "Ide acak") → `POST /api/ai/generate` → naskah + judul + tag + scene breakdown.
2. *(opsional)* Klik "Cek fakta" → `POST /api/ai/fact-check` → klaim faktual dinilai, bisa auto-revisi klaim bermasalah lewat `POST /api/ai/fix-narration`.
3. Klik render/upload → `POST /api/shorts/create-and-upload`:
   - `renderOrchestrator` pilih renderer aktif (Template / fal.ai / MoneyPrinterTurbo) berdasar Pengaturan.
   - Narasi disintesis TTS (kecuali dinonaktifkan), durasi video menyesuaikan panjang audio.
   - Kalau `privacyStatus !== 'none'`, video diupload ke Facebook Page (non-fatal kalau gagal — video tetap tersimpan lokal).
   - Record baru masuk `shortsHistory`, tersimpan ke `database.json`.

### Otomatis (auto-pilot / scheduler)
1. Cron (`node-cron`) trigger sesuai jadwal (default Senin/Rabu/Jumat 18:00 WIB).
2. Ambil topik teratas dari antrean (kalau kosong, minta AI usulkan topik baru).
3. Generate naskah → **cek keamanan konten** (fail-closed: gagal dicek = dianggap butuh review manual, bukan otomatis lolos).
4. Kalau aman: render → upload ke Facebook. Kalau berisiko/perlu review: video **tidak** dirender/upload, cuma dicatat di riwayat dengan status `AUTO_SCHEDULED_BLOCKED` untuk direview manual.
5. Semua eksekusi (berhasil/gagal/diblokir) masuk `schedulerConfig.executionLog`.

## Integrasi Eksternal

| Layanan | Wajib? | Biaya | Catatan |
|---|---|---|---|
| 9Router (lokal) | Ya, untuk naskah AI sungguhan | Gratis | Proxy AI open-source, jalan di `localhost:20128`. Tanpa ini, generate jatuh ke generator lokal (kualitas lebih rendah). |
| FFmpeg + curl | Ya | Gratis | Harus ada di PATH sistem. |
| Facebook Graph API | Ya, untuk upload sungguhan | Gratis | Page Access Token digenerate manual dari Meta for Developers (bukan OAuth redirect di app). Tanpa ini, upload jalan dalam mode simulasi (Sandbox). |
| edge-tts-universal | Tidak (tapi aktif secara default) | Gratis | Tidak resmi/reverse-engineered — bisa berhenti berfungsi kalau Microsoft ubah sesuatu di sisi mereka. |
| MoneyPrinterTurbo | Tidak (mode default: Template) | Gratis (footage) | Project Python terpisah, harus dijalankan sendiri (`start-moneyprinter.bat`). Butuh Pexels/Pixabay API key gratis. |
| fal.ai | Tidak | Berbayar (~$0.05-0.10/detik) | $20 kredit gratis saat signup. Fallback otomatis ke Template kalau gagal. |
| Tavily (pencarian web) | Tidak | Gratis (1.000 req/bulan) | Menyuntik fakta terkini ke prompt naskah & cek fakta. |

## Konfigurasi & Data

- `.env` — cuma `PORT` (port backend Express). Disalin dari `.env.example`.
- `server/data/database.json` — **semua** konfigurasi lain (API key AI, Facebook, fal.ai, Tavily, TTS, antrean scheduler, riwayat) tersimpan di sini, diisi lewat tab Pengaturan di UI. File ini **gitignored** (berisi secret plaintext).
- CORS backend dibatasi ke origin frontend sendiri (`localhost:5173` dev, `localhost:4173` preview) — lihat bagian "Perbaikan Terbaru" di bawah.

## Keterbatasan yang Diketahui

- **Mode Template FFmpeg**: backsound masih nada sine-wave sintetis (bukan musik asli) — belum kebagian perbaikan mood-matching yang sudah diterapkan ke mode MoneyPrinterTurbo.
- **Niche horor/misteri/konspirasi (MoneyPrinterTurbo)**: backsound sengaja dihening-kan total karena tidak ada satupun dari 29 track bawaan yang cocok secara mood (semuanya bernada major/cerah, khas musik stok generik).
- **Scheduler bergantung PC menyala terus** — kalau laptop mati/sleep pas jadwal auto-pilot tiba, eksekusi itu ter-skip tanpa notifikasi.
- **Tidak ada test otomatis** — regresi bisa lolos diam-diam, terutama di titik-titik alur yang kompleks (fallback AI, passthrough parameter antar service).
- **Background gambar mode Template** dari Picsum Photos (acak, bukan hasil pencarian sesuai tema).
- **Cuma Facebook** yang aktif untuk upload — integrasi YouTube masih ada di kode (`youtubeService.js`) tapi dormant, tidak dipakai.
- **Feedback loop performa** belum ada — tidak ada data insight (views/reach) ditarik balik dari Facebook untuk tahu topik/gaya mana yang perform.

## Perbaikan Terbaru (2026-08-14)

Sesi debugging yang menghasilkan 4 perbaikan signifikan:

1. **Generate naskah nyangkut lama / gagal parse JSON** — root cause: sebagian model gratis di balik combo 9Router (`hermes`/`RequirementBusinessAnalysis`) adalah model "reasoning" yang diam-diam menghabiskan seluruh `max_tokens` untuk berpikir internal sebelum menjawab (`finish_reason: "length"`, konten kepotong). Fix: tambah `reasoning: { exclude: true, enabled: false }` di 8 titik pemanggilan AI (`aiService.js`) — respons yang tadinya bisa >1 menit/timeout jadi ~3-5 detik dengan output bersih.
2. **Backsound video horor kejatah lagu romantis** — root cause ganda: (a) `niche` tidak pernah diteruskan sampai ke MoneyPrinterTurbo (terputus di `renderOrchestrator.js` dan dua titik pemanggilnya), (b) `bgm_type: 'random'` comot buta dari 29 track tanpa metadata mood. Fix: analisis fitur akustik nyata (tempo/BPM, energi RMS, kecerahan spektral, mode major/minor) atas seluruh track lewat `librosa`, dikelompokkan jadi 3 bucket mood, dipilih otomatis sesuai niche (`resolveBgm()` di `moneyPrinterService.js`); niche horor/misteri/konspirasi dimatikan backsound-nya sama sekali karena tidak ada track yang cocok.
3. **CORS wildcard membocorkan API key** — `cors()` tanpa opsi mengirim `Access-Control-Allow-Origin: *` di semua respons, termasuk `/api/settings` yang mengembalikan API key mentah (AI, fal.ai, Tavily, Page Access Token Facebook). Sembarang website yang dibuka di browser yang sama bisa diam-diam mencuri key itu. Fix: CORS dibatasi ke allowlist origin frontend sendiri (`localhost:5173`/`4173`).
4. **Narator kedengaran seperti robot** — root cause: setelan terpakai voice `en-US-AvaMultilingualNeural` (voice Inggris "dipaksa" ngomong Indonesia, logat asing) dengan pitch di-geser +8Hz. Fix: pindah ke voice Indonesia asli `id-ID-ArdiNeural`, pitch dikembalikan ke netral (+0Hz).

Commit: [`513cc31`](https://github.com/Miipahhh/Generate-Video-Short-YT-Otomatis/commit/513cc31) — perbaikan #1-3 (kode). Perbaikan #4 tersimpan sebagai config di `database.json` (tidak perlu commit).

## Roadmap / Belum Dikerjakan

Diurutkan kira-kira sesuai prioritas:

1. **Feedback loop performa** — tarik data insight (views/reach) dari Facebook Graph API per video yang sudah diupload, supaya ada data buat tahu topik/gaya mana yang perform, bukan cuma generate→upload lalu lupa.
2. **Backsound mode Template FFmpeg** — belum kebagian perbaikan mood-matching seperti mode MoneyPrinterTurbo.
3. **BGM asli untuk niche horor** — MoneyPrinterTurbo punya fitur upload BGM sendiri; kalau diisi beberapa track "dark ambient" gratis (lisensi jelas, mis. Pixabay Music), horor bisa dapat musik asli alih-alih hening total.
4. **Test otomatis** — minimal untuk service kritis (`renderOrchestrator`, `schedulerService`, `dbService`, alur fallback `aiService`).
5. **Ketahanan scheduler** — notifikasi (Telegram/email) kalau eksekusi auto-pilot terlewat/gagal, atau pertimbangkan hosting di VPS kecil supaya tidak bergantung PC menyala.
6. **Multi-platform** — Instagram Reels/TikTok, atau aktifkan lagi integrasi YouTube yang sudah ada tapi dormant.
7. **Background gambar mode Template** — ganti dari Picsum acak ke pencarian gambar sesuai tema (Unsplash/Pexels image API).

## Cara Menjalankan (ringkas)

```bash
npm install
npm run dev       # backend (3001) + frontend Vite (5173) bersamaan
```

Atau `start.bat` (mulai baru) / `restart.bat` (matikan proses lalu jalankan ulang) — keduanya otomatis mengecek & menjalankan 9Router juga. Detail lengkap setup (koneksi 9Router, Facebook Page, fal.ai, MoneyPrinterTurbo, TTS, Tavily) ada di [README.md](README.md).
