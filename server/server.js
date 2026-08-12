import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import aiService from './services/aiService.js';
import aiVideoService from './services/aiVideoService.js';
import moneyPrinterService from './services/moneyPrinterService.js';
import renderOrchestrator from './services/renderOrchestrator.js';
import ttsService from './services/ttsService.js';
import youtubeService from './services/youtubeService.js';
import schedulerService from './services/schedulerService.js';
import dbService from './services/dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/videos', express.static(path.join(__dirname, '../public/videos')));

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
    schedulerConfig: schedulerService.getSchedulerConfig(),
    totalShortsCreated: shortsHistory.length
  });
});

// Generate Naskah, Judul, Deskripsi, Tag via AI Hermes
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { topic, niche, tone } = req.body;
    const aiResult = await aiService.generateShortContent(topic, niche, tone);
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

// Dapatkan Daftar Semua Shorts
app.get('/api/shorts', (req, res) => {
  res.json({ success: true, data: shortsHistory });
});

// Buat Baru dari Awal hingga Upload Lengkap (One-Click Generate & Upload)
app.post('/api/shorts/create-and-upload', async (req, res) => {
  try {
    const { topic, niche, tone, themeId, privacyStatus, title, description, tags, narration, scenes } = req.body;

    // Jika title sudah tersedia (dari frontend), gunakan langsung; jika tidak, generate
    let aiContent;
    if (title) {
      aiContent = { title, description, tags, narration, scenes };
    } else {
      aiContent = await aiService.generateShortContent(topic, niche, tone);
    }

    // 2. Render Video Vertikal 9:16 (AI Video via fal.ai kalau diaktifkan, fallback ke template FFmpeg)
    const renderedVideo = await renderOrchestrator.renderShort({
      title: aiContent.title,
      narration: aiContent.narration,
      scenes: aiContent.scenes,
      themeId,
      durationSeconds: aiContent.durationSeconds
    });

    // 3. Upload ke YouTube Shorts API (non-fatal jika gagal).
    // privacyStatus 'none' berarti user memilih render saja: videonya cukup tersimpan lokal
    // dan sama sekali tidak dikirim ke YouTube.
    let uploadResult = null;
    if (privacyStatus !== 'none') {
      try {
        uploadResult = await youtubeService.uploadShort({
          title: aiContent.title,
          description: aiContent.description,
          tags: aiContent.tags,
          privacyStatus: privacyStatus || 'public',
          videoData: renderedVideo
        });
      } catch (uploadErr) {
        console.warn('Upload YouTube gagal (non-fatal):', uploadErr.message);
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

// Hapus Short dari Riwayat
app.delete('/api/shorts/:id', (req, res) => {
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
      videoConfig: dbService.getVideoConfig(),
      ttsConfig: ttsService.getConfig()
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

app.listen(PORT, () => {
  console.log(`✨ AI Shorts Studio Backend Server berjalan pada http://localhost:${PORT}`);
});
