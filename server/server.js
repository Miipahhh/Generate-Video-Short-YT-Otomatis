import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import aiService from './services/aiService.js';
import aiVideoService from './services/aiVideoService.js';
import moneyPrinterService from './services/moneyPrinterService.js';
import renderOrchestrator from './services/renderOrchestrator.js';
import ttsService from './services/ttsService.js';
import youtubeService from './services/youtubeService.js';
import facebookService from './services/facebookService.js';
import schedulerService from './services/schedulerService.js';
import dbService from './services/dbService.js';
import searchService from './services/searchService.js';
import footageService from './services/footageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/videos', express.static(path.join(__dirname, '../public/videos')));
// Footage MoneyPrinterTurbo milik user sendiri (bukan hasil pencarian stok) — disajikan
// buat preview <video> di UI Studio, sumbernya sama dengan yang dipakai render.
app.use('/footage', express.static(footageService.dir));

// Penyimpanan data lokal di database persisten
let shortsHistory = dbService.getHistory();

// Mulai cron scheduler
schedulerService.startScheduler((newShort) => {
  shortsHistory.unshift(newShort);
  dbService.saveHistory(shortsHistory);
});

// =================== ENDPOINTS ===================

// Status Sistem Keseluruhan
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    version: '1.0.0',
    aiConfig: aiService.getConfig(),
    youtubeStatus: youtubeService.getStatus(),
    facebookStatus: facebookService.getStatus(),
    schedulerConfig: schedulerService.getSchedulerConfig(),
    totalShortsCreated: shortsHistory.length
  });
});

// Generate Naskah, Judul, Deskripsi, Tag via AI Hermes
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { topic, niche, tone, targetDurationSeconds } = req.body;
    const aiResult = await aiService.generateShortContent(topic, niche, tone, targetDurationSeconds);
    res.json({ success: true, data: aiResult });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Usulkan Ide Topik Acak Lintas Genre (termasuk cerita fiksi/misteri, bukan cuma teknologi)
app.post('/api/ai/random-topic', async (req, res) => {
  try {
    const suggestion = await aiService.suggestRandomTopic();
    res.json({ success: true, data: suggestion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cek fakta naskah narasi lewat model AI yang sama (bukan pencarian internet — lihat
// disclaimer di factCheckNarration/UI).
app.post('/api/ai/fact-check', async (req, res) => {
  try {
    const { narration, topic } = req.body;
    const result = await aiService.factCheckNarration(narration, topic);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Revisi naskah supaya klaim bermasalah dari cek fakta diperbaiki, tanpa menulis ulang
// seluruh naskah dari nol.
app.post('/api/ai/fix-narration', async (req, res) => {
  try {
    const { title, description, tags, narration, durationSeconds, scenes, claims, topic } = req.body;
    const revised = await aiService.reviseNarrationForFactCheck(
      { title, description, tags, narration, durationSeconds, scenes },
      claims,
      topic
    );
    res.json({ success: true, data: revised });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Progres render yang sedang berjalan. Hanya MoneyPrinterTurbo yang melaporkan angka
// sungguhan; renderer lain balas active:false dan UI memakai perkiraan dari waktu berjalan.
app.get('/api/render/progress', (req, res) => {
  const task = moneyPrinterService.getProgress();
  res.json({
    success: true,
    data: task
      ? { active: true, percent: task.percent, source: 'moneyprinter' }
      : { active: false, percent: null, source: null }
  });
});

// Dapatkan Daftar Semua Shorts. Kalau file MP4-nya ternyata sudah tidak ada di disk (mis.
// terhapus manual di luar aplikasi), URL-nya disamarkan jadi null di sini supaya UI menampilkan
// badge "MP4 tidak tersedia" alih-alih tombol Putar/Download yang ujung-ujungnya 404.
app.get('/api/shorts', (req, res) => {
  const data = shortsHistory.map((item) => {
    const filename = item.renderedVideo?.videoFilename;
    if (!filename) return item;
    const videoPath = path.join(__dirname, '../public/videos', filename);
    if (fs.existsSync(videoPath)) return item;
    return {
      ...item,
      renderedVideo: { ...item.renderedVideo, videoUrl: null, downloadUrl: null },
      uploadResult: item.uploadResult
        ? { ...item.uploadResult, localVideoUrl: null, localDownloadUrl: null }
        : item.uploadResult
    };
  });
  res.json({ success: true, data });
});

// Buat Baru dari Awal hingga Upload Lengkap (One-Click Generate & Upload)
app.post('/api/shorts/create-and-upload', async (req, res) => {
  try {
    const { topic, niche, tone, themeId, privacyStatus, title, description, tags, narration, scenes, durationSeconds, localFootage } = req.body;

    // Jika title sudah tersedia (dari frontend), gunakan langsung; jika tidak, generate.
    // durationSeconds harus ikut disertakan di sini — sebelumnya field ini tidak dibawa,
    // jadi render selalu jatuh ke durasi default (8 detik) meski naskah dari Studio sudah
    // punya target/perkiraan durasi sendiri.
    let aiContent;
    if (title) {
      aiContent = { title, description, tags, narration, scenes, durationSeconds };
    } else {
      aiContent = await aiService.generateShortContent(topic, niche, tone);
    }

    // 2. Render Video Vertikal 9:16 (AI Video via fal.ai kalau diaktifkan, fallback ke template FFmpeg)
    const renderedVideo = await renderOrchestrator.renderShort({
      title: aiContent.title,
      narration: aiContent.narration,
      scenes: aiContent.scenes,
      themeId,
      durationSeconds: aiContent.durationSeconds,
      // Footage MoneyPrinterTurbo milik user sendiri, urut sesuai adegan (array nama file di
      // folder local_videos) — kalau diisi, dipakai menggantikan pencarian stok Pexels/Pixabay.
      localFootage: Array.isArray(localFootage) && localFootage.length > 0 ? localFootage : undefined
    });

    // 3. Upload ke Facebook Page lewat Graph API (non-fatal jika gagal).
    // privacyStatus 'none' berarti user memilih render saja: videonya cukup tersimpan lokal
    // dan sama sekali tidak dikirim ke Facebook.
    let uploadResult = null;
    if (privacyStatus !== 'none') {
      try {
        uploadResult = await facebookService.uploadShort({
          title: aiContent.title,
          description: aiContent.description,
          tags: aiContent.tags,
          privacyStatus: privacyStatus || 'public',
          videoData: renderedVideo
        });
      } catch (uploadErr) {
        console.warn('Upload Facebook gagal (non-fatal):', uploadErr.message);
      }
    }

    const newRecord = {
      id: 'short_' + Date.now(),
      topic,
      niche,
      title: aiContent.title,
      description: aiContent.description,
      tags: aiContent.tags,
      narration: aiContent.narration,
      scenes: aiContent.scenes,
      renderedVideo,
      uploadResult,
      createdAt: new Date().toISOString(),
      type: 'MANUAL_STUDIO'
    };

    shortsHistory.unshift(newRecord);
    dbService.saveHistory(shortsHistory);

    res.json({ success: true, data: newRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Hapus Short dari Riwayat — file MP4 di disk ikut dihapus (bukan cuma catatan riwayatnya),
// sesuai yang dijanjikan dialog konfirmasi di UI ("File MP4-nya tidak bisa dikembalikan").
// Tanpa ini, video lama menumpuk permanen di public/videos walau sudah "dihapus" dari riwayat.
app.delete('/api/shorts/:id', (req, res) => {
  const target = shortsHistory.find(s => s.id === req.params.id);
  const filename = target?.renderedVideo?.videoFilename;
  if (filename) {
    const videoPath = path.join(__dirname, '../public/videos', filename);
    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (err) {
      console.warn('Gagal menghapus file video saat hapus riwayat:', err.message);
    }
  }
  shortsHistory = shortsHistory.filter(s => s.id !== req.params.id);
  dbService.saveHistory(shortsHistory);
  res.json({ success: true, data: shortsHistory });
});

// Pengaturan Persisten (Database)
app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      aiConfig: dbService.getAiConfig(),
      youtubeConfig: dbService.getYouTubeConfig(),
      facebookConfig: dbService.getFacebookConfig(),
      videoConfig: dbService.getVideoConfig(),
      ttsConfig: ttsService.getConfig(),
      // dbService.getSearchConfig() (bukan searchService.getConfig()) sengaja dipakai di sini
      // supaya API key mentahnya ikut terkirim — sama seperti videoConfig.falApiKey — jadi form
      // Pengaturan bisa menampilkan/mengedit key yang sudah tersimpan, bukan cuma status ada/tidak.
      searchConfig: dbService.getSearchConfig()
    }
  });
});

app.post('/api/settings/ai', (req, res) => {
  const updated = dbService.saveAiConfig(req.body);
  if (req.body.apiKey !== undefined) {
    aiService.apiKey = req.body.apiKey;
  }
  if (req.body.model) {
    aiService.model = req.body.model;
  }
  if (req.body.aiEndpoint) {
    aiService.apiEndpoint = req.body.aiEndpoint;
  }
  res.json({ success: true, data: updated });
});

// Pencarian web (Tavily, opsional) buat menyuntik fakta terkini ke naskah & cek fakta
app.post('/api/settings/search', (req, res) => {
  const { enabled, tavilyApiKey } = req.body;
  searchService.updateConfig({ enabled, tavilyApiKey });
  res.json({ success: true, data: searchService.getConfig() });
});

// Pengaturan Video Generator (Template FFmpeg, AI Video via fal.ai, atau MoneyPrinterTurbo)
app.post('/api/settings/video', (req, res) => {
  const { provider, falApiKey, falModel, resolution, aiBackgroundImages, moneyPrinterEndpoint } = req.body;
  aiVideoService.updateConfig({ provider, falApiKey, falModel, resolution, aiBackgroundImages });
  moneyPrinterService.updateConfig({ provider, moneyPrinterEndpoint });
  res.json({ success: true, data: { ...aiVideoService.getConfig(), ...moneyPrinterService.getConfig() } });
});

// Cek cepat apakah server MoneyPrinterTurbo lokal sedang menyala di endpoint yang dikonfigurasi
app.get('/api/settings/moneyprinter/ping', async (req, res) => {
  const alive = await moneyPrinterService.pingServer();
  res.json({ success: true, data: { alive, endpoint: moneyPrinterService.endpoint } });
});

// ============ Footage sendiri (MoneyPrinterTurbo, video_source: 'local') ============
// Supaya video bisa menampilkan wajah/momen sungguhan (mis. tokoh publik tertentu) yang
// memang TIDAK ADA di database stok Pexels/Pixabay — user upload footage yang haknya sendiri,
// naskah/suara/subtitle/potong-sambungnya tetap otomatis seperti biasa.
const footageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        footageService.ensureDir();
        cb(null, footageService.dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => cb(null, footageService.sanitizeFilename(file.originalname))
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 10 }, // 500MB/file, maks 10 file sekaligus
  fileFilter: (req, file, cb) => {
    cb(null, footageService.isAllowedExt(file.originalname));
  }
});

app.get('/api/footage', (req, res) => {
  res.json({ success: true, data: { installed: footageService.isMoneyPrinterInstalled, clips: footageService.list() } });
});

app.post('/api/footage/upload', footageUpload.array('clips', 10), (req, res) => {
  const uploaded = (req.files || []).map((f) => f.filename);
  if (uploaded.length === 0) {
    return res.status(400).json({ success: false, message: 'Tidak ada file valid yang ter-upload (format didukung: mp4, mov, webm, mkv, avi).' });
  }
  res.json({ success: true, data: { uploaded, clips: footageService.list() } });
});

app.delete('/api/footage/:filename', (req, res) => {
  try {
    footageService.delete(req.params.filename);
    res.json({ success: true, data: footageService.list() });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Pengaturan Narator Suara (TTS gratis via edge-tts, tanpa API key)
app.post('/api/settings/tts', (req, res) => {
  const { enabled, voice, rate, pitch } = req.body;
  ttsService.updateConfig({ enabled, voice, rate, pitch });
  res.json({ success: true, data: ttsService.getConfig() });
});

// Contoh suara pendek supaya pilihan narator bisa didengar dulu sebelum disimpan
app.post('/api/settings/tts/preview', async (req, res) => {
  try {
    const { voice, rate, pitch } = req.body;
    const preview = await ttsService.synthesizePreview({ voice, rate, pitch });
    res.json({ success: true, data: preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/settings/youtube', (req, res) => {
  const { channelName, clientId, clientSecret } = req.body;
  youtubeService.updateCredentials({ channelName, clientId, clientSecret });
  res.json({ success: true, data: dbService.getYouTubeConfig(), youtubeStatus: youtubeService.getStatus() });
});

// Pengaturan YouTube Data API & Channel
app.get('/api/youtube/status', (req, res) => {
  res.json(youtubeService.getStatus());
});

// ============ OAuth 2.0 Google/YouTube ============

// Mulai alur OAuth — arahkan browser ke consent screen Google
app.get('/api/youtube/oauth/connect', (req, res) => {
  try {
    res.redirect(youtubeService.getAuthUrl());
  } catch (error) {
    res.status(400).send(`<h2>Gagal memulai koneksi YouTube</h2><p>${error.message}</p><p><a href="/">Kembali ke aplikasi</a></p>`);
  }
});

// Callback yang didaftarkan di Google Cloud Console (Authorized redirect URI)
app.get('/api/youtube/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).send(`<h2>Koneksi YouTube dibatalkan</h2><p>${error}</p><p><a href="/">Kembali ke aplikasi</a></p>`);
  }
  try {
    await youtubeService.handleOAuthCallback(code);
    res.redirect('/?youtube=connected');
  } catch (err) {
    const googleError = err.response?.data;
    console.error('OAuth callback gagal:', googleError || err.message);
    const detail = googleError
      ? `<p><strong>${googleError.error || 'error'}</strong>: ${googleError.error_description || JSON.stringify(googleError)}</p>`
      : `<p>${err.message}</p>`;
    res.status(500).send(`<h2>Gagal menghubungkan YouTube</h2>${detail}<p><a href="/">Kembali ke aplikasi</a></p>`);
  }
});

// Putuskan koneksi OAuth (kembali ke Sandbox Mode)
app.post('/api/youtube/oauth/disconnect', (req, res) => {
  youtubeService.disconnect();
  res.json({ success: true, youtubeStatus: youtubeService.getStatus() });
});

// ============ Facebook Page (Graph API) — target upload otomatis saat ini ============
// Beda dari YouTube: tidak ada alur OAuth redirect di aplikasi ini. User generate PAGE ACCESS
// TOKEN sendiri dari Meta for Developers (App & Page miliknya sendiri) lalu tempel langsung di
// Pengaturan — lihat README bagian "Upload ke Facebook Page".
app.post('/api/settings/facebook', (req, res) => {
  const { pageName, pageId, pageAccessToken } = req.body;
  facebookService.updateCredentials({ pageName, pageId, pageAccessToken });
  res.json({ success: true, data: dbService.getFacebookConfig(), facebookStatus: facebookService.getStatus() });
});

app.get('/api/facebook/status', (req, res) => {
  res.json(facebookService.getStatus());
});

// Cek cepat apakah Page ID + Access Token yang disimpan memang valid & bisa dipakai upload
app.post('/api/facebook/verify', async (req, res) => {
  const result = await facebookService.verifyConnection();
  res.json({ success: true, data: result });
});

app.post('/api/facebook/disconnect', (req, res) => {
  facebookService.disconnect();
  res.json({ success: true, facebookStatus: facebookService.getStatus() });
});

// Penjadwal Otomatis 3x Seminggu (Scheduler)
app.get('/api/scheduler/config', (req, res) => {
  res.json({ success: true, data: schedulerService.getSchedulerConfig() });
});

app.post('/api/scheduler/config', (req, res) => {
  const body = req.body;
  // Dukung baik `enabled` (frontend) maupun `isAutoPilotEnabled` (internal)
  if (body.enabled !== undefined) {
    body.isAutoPilotEnabled = body.enabled;
  }
  const updated = schedulerService.updateConfig(body);
  res.json({ success: true, data: updated });
});

app.post('/api/scheduler/topic-queue', (req, res) => {
  const { topic, niche } = req.body;
  schedulerService.addTopic({ topic, niche });
  res.json({ success: true, data: schedulerService.getSchedulerConfig() });
});

app.delete('/api/scheduler/topic-queue/:id', (req, res) => {
  schedulerService.deleteTopic(req.params.id);
  res.json({ success: true, data: schedulerService.getSchedulerConfig() });
});

// Jalankan Eksekusi Jadwal Otomatis Sekarang (Untuk Testing / Trigger Manual)
app.post('/api/scheduler/run-now', async (req, res) => {
  try {
    const executedRecord = await schedulerService.runNextScheduledJob();
    res.json({ success: true, data: executedRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Multer melempar error (mis. file kelewat besar) lewat next(err), bukan lewat handler biasa —
// tangkap di sini supaya responsnya JSON yang jelas, bukan HTML error page default Express.
// Harus di akhir (setelah semua route) sesuai konvensi Express untuk error-handling middleware.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`✨ AI Shorts Studio Backend Server berjalan pada http://localhost:${PORT}`);
});
