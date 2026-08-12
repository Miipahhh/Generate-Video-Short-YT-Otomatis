import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.dbFile = path.join(this.dataDir, 'database.json');

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.defaultData = {
      aiConfig: {
        aiEndpoint: 'http://localhost:20128/v1',
        apiKey: '',
        model: 'hermes',
      },
      youtubeConfig: {
        channelName: 'AI Shorts Studio Channel',
        clientId: '',
        clientSecret: '',
        accessToken: '',
        refreshToken: '',
        tokenExpiresAt: 0,
        channelId: '',
        subscriberCount: '',
        mode: 'SANDBOX'
      },
      videoConfig: {
        provider: 'template', // 'template' (FFmpeg, gratis) | 'fal_ai' (AI video generation, berbayar) | 'moneyprinter' (MoneyPrinterTurbo, footage stok asli)
        falApiKey: '',
        falModel: 'wan/v2.6/text-to-video',
        resolution: '720p',
        aiBackgroundImages: false, // background gambar AI (fal.ai FLUX schnell) di mode template, opt-in karena berbayar
        moneyPrinterEndpoint: 'http://127.0.0.1:8080' // endpoint API MoneyPrinterTurbo lokal (lihat start-moneyprinter.bat)
      },
      ttsConfig: {
        enabled: true, // Narator suara AI (edge-tts, gratis tanpa API key)
        voice: 'id-ID-GadisNeural',
        rate: '+0%',
        pitch: '+0Hz'
      },
      schedulerConfig: {
        isAutoPilotEnabled: true,
        topicQueue: []
      },
      shortsHistory: []
    };

    this.data = this.loadDatabase();
  }

  loadDatabase() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          ...this.defaultData,
          ...parsed,
          aiConfig: { ...this.defaultData.aiConfig, ...(parsed.aiConfig || {}) },
          youtubeConfig: { ...this.defaultData.youtubeConfig, ...(parsed.youtubeConfig || {}) },
          videoConfig: { ...this.defaultData.videoConfig, ...(parsed.videoConfig || {}) },
          ttsConfig: { ...this.defaultData.ttsConfig, ...(parsed.ttsConfig || {}) },
          schedulerConfig: { ...this.defaultData.schedulerConfig, ...(parsed.schedulerConfig || {}) }
        };
      }
    } catch (err) {
      console.error('Error loading database.json:', err.message);
    }
    this.saveDatabase(this.defaultData);
    return JSON.parse(JSON.stringify(this.defaultData));
  }

  saveDatabase(newData = null) {
    if (newData) {
      this.data = newData;
    }
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Error writing database.json:', err.message);
      return false;
    }
  }

  getAiConfig() {
    return this.data.aiConfig;
  }

  saveAiConfig(config = {}) {
    this.data.aiConfig = { ...this.data.aiConfig, ...config };
    this.saveDatabase();
    return this.data.aiConfig;
  }

  getYouTubeConfig() {
    return this.data.youtubeConfig;
  }

  saveYouTubeConfig(config = {}) {
    this.data.youtubeConfig = { ...this.data.youtubeConfig, ...config };
    this.saveDatabase();
    return this.data.youtubeConfig;
  }

  getVideoConfig() {
    return this.data.videoConfig;
  }

  saveVideoConfig(config = {}) {
    this.data.videoConfig = { ...this.data.videoConfig, ...config };
    this.saveDatabase();
    return this.data.videoConfig;
  }

  getTtsConfig() {
    return this.data.ttsConfig;
  }

  saveTtsConfig(config = {}) {
    this.data.ttsConfig = { ...this.data.ttsConfig, ...config };
    this.saveDatabase();
    return this.data.ttsConfig;
  }

  getSchedulerConfig() {
    return this.data.schedulerConfig;
  }

  saveSchedulerConfig(config = {}) {
    this.data.schedulerConfig = { ...this.data.schedulerConfig, ...config };
    this.saveDatabase();
    return this.data.schedulerConfig;
  }

  getHistory() {
    return this.data.shortsHistory || [];
  }

  saveHistory(history = []) {
    this.data.shortsHistory = history;
    this.saveDatabase();
    return this.data.shortsHistory;
  }

  addHistoryRecord(record) {
    if (!this.data.shortsHistory) this.data.shortsHistory = [];
    this.data.shortsHistory.unshift(record);
    this.saveDatabase();
    return record;
  }

  deleteHistoryRecord(id) {
    this.data.shortsHistory = (this.data.shortsHistory || []).filter(item => item.id !== id);
    this.saveDatabase();
    return this.data.shortsHistory;
  }
}

export default new DatabaseService();
