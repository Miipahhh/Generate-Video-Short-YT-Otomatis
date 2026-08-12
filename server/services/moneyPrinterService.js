import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';
import ttsService from './ttsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State enum dari MoneyPrinterTurbo (app/models/const.py)
const TASK_STATE_FAILED = -1;
const TASK_STATE_COMPLETE = 1;

// MoneyPrinterTurbo pakai format voice_name "{EdgeTTSName}-{Gender}" (lihat schema.py:
// default "zh-CN-XiaoxiaoNeural-Female"). Voice edge-tts yang sudah kita pakai di
// ttsService.js perlu dipetakan ke format ini.
const VOICE_GENDER_MAP = {
  'id-ID-GadisNeural': 'Female',
  'id-ID-ArdiNeural': 'Male',
  'en-US-AvaMultilingualNeural': 'Female',
  'en-US-EmmaMultilingualNeural': 'Female',
  'en-US-AndrewMultilingualNeural': 'Male',
  'en-US-BrianMultilingualNeural': 'Male'
};

/**
 * Integrasi ke MoneyPrinterTurbo (https://github.com/harry0703/MoneyPrinterTurbo) —
 * generator video short open-source berbasis Python yang mencocokkan footage stok asli
 * (Pexels/Pixabay/Coverr) dengan naskah narasi, lalu merender subtitle & audio TTS
 * otomatis via REST API-nya sendiri (FastAPI, default port 8080).
 *
 * Servernya HARUS dijalankan terpisah di mesin yang sama (lihat start-moneyprinter.bat)
 * karena ini proyek Python mandiri, bukan library npm — kita hanya memanggil API-nya.
 */
class MoneyPrinterService {
  constructor() {
    const saved = dbService.getVideoConfig() || {};
    this.provider = saved.provider || 'template';
    this.endpoint = saved.moneyPrinterEndpoint || 'http://127.0.0.1:8080';
    this.videosDir = path.join(__dirname, '../../public/videos');
    if (!fs.existsSync(this.videosDir)) fs.mkdirSync(this.videosDir, { recursive: true });
    // Progres task yang sedang berjalan, dibaca UI lewat GET /api/render/progress.
    // MoneyPrinterTurbo satu-satunya renderer yang melaporkan progres sungguhan (0-100).
    this.currentTask = null;
  }

  /** Progres render yang sedang berjalan, atau null kalau tidak ada. */
  getProgress() {
    return this.currentTask;
  }

  updateConfig({ provider, moneyPrinterEndpoint }) {
    if (provider) this.provider = provider;
    if (moneyPrinterEndpoint) this.endpoint = moneyPrinterEndpoint;
    dbService.saveVideoConfig({
      provider: this.provider,
      moneyPrinterEndpoint: this.endpoint
    });
  }

  getConfig() {
    return {
      provider: this.provider,
      moneyPrinterEndpoint: this.endpoint
    };
  }

  get isEnabled() {
    return this.provider === 'moneyprinter';
  }

  resolveVoiceName(edgeVoiceId) {
    const gender = VOICE_GENDER_MAP[edgeVoiceId] || 'Female';
    return `${edgeVoiceId}-${gender}`;
  }

  /** "+15%" / "-7%" (format edge-tts) → pengali kecepatan MoneyPrinterTurbo (1.0 = normal). */
  resolveVoiceRate(rate) {
    const percent = parseFloat(String(rate || '+0%').replace('%', ''));
    if (!Number.isFinite(percent)) return 1.0;
    return Math.min(2, Math.max(0.5, Number((1 + percent / 100).toFixed(2))));
  }

  /**
   * Cek cepat apakah server MoneyPrinterTurbo memang menyala di endpoint yang dikonfigurasi,
   * supaya kita bisa kasih pesan error yang jelas ("server belum jalan") daripada timeout
   * generik kalau user lupa menjalankan start-moneyprinter.bat.
   */
  async pingServer() {
    try {
      await axios.get(`${this.endpoint}/api/v1/musics`, { timeout: 4000 });
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Kirim naskah narasi yang SUDAH digenerate Hermes AI ke MoneyPrinterTurbo (field
   * video_script), supaya MPT tidak menulis ulang naskahnya sendiri — MPT hanya bertugas
   * mencocokkan footage stok, mensintesis suara (edge-tts internal), dan membakar subtitle.
   */
  async generateVideo({ title, narration, scenes, durationSeconds, ttsVoice, ttsRate }) {
    const alive = await this.pingServer();
    if (!alive) {
      throw new Error(`Server MoneyPrinterTurbo tidak terjangkau di ${this.endpoint}. Jalankan start-moneyprinter.bat dulu.`);
    }

    const rawScript = (narration || (scenes || []).map((s) => s.narrationSegment).join(' ') || title || '').trim();
    // MoneyPrinterTurbo mensintesis suaranya sendiri, jadi teksnya dirapikan di sini juga
    // (buang emoji/hashtag, KAPITAL SEMUA, tanda seru bertubi-tubi) — kalau tidak, pembawaan
    // narasinya jadi kaku/teriak-teriak persis seperti kalau kita sintesis sendiri.
    const script = ttsService.humanize(rawScript);
    if (!script) {
      throw new Error('Naskah narasi kosong, tidak ada yang bisa dijadikan video.');
    }

    const voiceName = this.resolveVoiceName(ttsVoice || 'id-ID-GadisNeural');
    // Setelan kecepatan kita ("+15%", "-7%", ...) dipetakan ke skala pengali milik MPT (1.0 = normal).
    const voiceRate = this.resolveVoiceRate(ttsRate);
    const clipDuration = Math.max(3, Math.min(8, Math.round((durationSeconds || 30) / Math.max(scenes?.length || 4, 1))));

    let createRes;
    try {
      createRes = await axios.post(`${this.endpoint}/api/v1/videos`, {
        video_subject: (title || 'Video Short').slice(0, 100),
        video_script: script,
        video_aspect: '9:16',
        video_concat_mode: 'random',
        video_clip_duration: clipDuration,
        video_count: 1,
        video_source: 'pexels',
        voice_name: voiceName,
        voice_rate: voiceRate,
        subtitle_enabled: true,
        bgm_type: 'random',
        bgm_volume: 0.2,
        // Default MoneyPrinterTurbo cuma pakai 2 thread ffmpeg — jauh di bawah kapasitas CPU
        // modern. Naikkan supaya proses concat/render lebih cepat (aman diturunkan manual di
        // config.toml kalau CPU-nya lebih terbatas dari yang diasumsikan di sini).
        n_threads: 8
      }, { timeout: 20000 });
    } catch (err) {
      throw new Error(`Gagal membuat task MoneyPrinterTurbo: ${this.describeAxiosError(err)}`);
    }

    const taskId = createRes.data?.data?.task_id;
    if (!taskId) {
      throw new Error(`MoneyPrinterTurbo tidak mengembalikan task_id. Respons: ${JSON.stringify(createRes.data).slice(0, 300)}`);
    }

    // Poll sampai selesai — sourcing footage asli + TTS + burn subtitle jauh lebih lambat dari
    // template FFmpeg, dan waktunya scaling kira-kira proporsional sama panjang video (video 42
    // detik pernah butuh ~13 menit di CPU biasa). Jadi timeout dihitung dari durationSeconds
    // (±20x durasi asli), minimal 12 menit, dibatasi maksimal 60 menit supaya request tidak
    // menggantung tanpa batas — kalau kepotong di durasi sangat panjang (mis. cerita 5 menit),
    // otomatis fallback ke template FFmpeg yang jauh lebih cepat untuk konten sepanjang itu.
    const maxWaitMs = Math.min(60 * 60 * 1000, Math.max(12 * 60 * 1000, (durationSeconds || 30) * 20 * 1000));
    const pollIntervalMs = 4000;
    const startedAt = Date.now();
    let lastTask = null;
    this.currentTask = { taskId, percent: 0, startedAt };

    try {
      while (Date.now() - startedAt < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        let statusRes;
        try {
          statusRes = await axios.get(`${this.endpoint}/api/v1/tasks/${taskId}`, { timeout: 15000 });
        } catch (err) {
          continue; // sesekali gagal poll gak fatal, coba lagi di iterasi berikutnya
        }
        lastTask = statusRes.data?.data;
        if (!lastTask) continue;
        // Progres sungguhan dari MPT (0-100) supaya bar loading di UI bukan cuma tebakan waktu.
        if (Number.isFinite(lastTask.progress)) {
          this.currentTask = { taskId, percent: lastTask.progress, startedAt };
        }
        if (lastTask.state === TASK_STATE_FAILED) {
          throw new Error(`MoneyPrinterTurbo gagal generate video (task ${taskId}).`);
        }
        if (lastTask.state === TASK_STATE_COMPLETE && lastTask.videos?.length) break;
      }
    } finally {
      this.currentTask = null;
    }

    if (!lastTask || lastTask.state !== TASK_STATE_COMPLETE || !lastTask.videos?.length) {
      throw new Error(`MoneyPrinterTurbo timeout menunggu hasil video (progress terakhir: ${lastTask?.progress ?? '?'}%).`);
    }

    // MoneyPrinterTurbo hanya mengembalikan URL absolut kalau `endpoint` diisi di
    // config.toml-nya; kalau kosong, ia balikin path relatif (mis. /tasks/xxx/final-1.mp4).
    const rawVideoRef = lastTask.videos[0];
    const remoteVideoUrl = /^https?:\/\//i.test(rawVideoRef)
      ? rawVideoRef
      : `${this.endpoint}${rawVideoRef.startsWith('/') ? '' : '/'}${rawVideoRef}`;

    // Unduh video hasil generate ke folder lokal kita supaya konsisten dengan alur
    // aiVideoService (disajikan via /videos static route, bukan proxy ke server Python).
    const filename = `mpt_${Date.now()}.mp4`;
    const localPath = path.join(this.videosDir, filename);
    let videoRes;
    try {
      videoRes = await axios.get(remoteVideoUrl, { responseType: 'arraybuffer', timeout: 120000 });
    } catch (err) {
      throw new Error(`Gagal mengunduh hasil video dari MoneyPrinterTurbo: ${this.describeAxiosError(err)}`);
    }
    fs.writeFileSync(localPath, videoRes.data);

    return {
      id: 'mpt_' + Date.now(),
      aspectRatio: '9:16',
      resolution: '1080x1920',
      durationSeconds: durationSeconds || 30,
      provider: 'MoneyPrinterTurbo',
      taskId,
      scenes: (scenes || []).map((scene, idx) => ({ ...scene, startTime: idx * 2, endTime: (idx + 1) * 2 })),
      renderStatus: 'COMPLETED',
      videoFilename: filename,
      videoUrl: `/videos/${filename}`,
      downloadUrl: `/videos/${filename}`,
      createdTimestamp: new Date().toISOString()
    };
  }

  describeAxiosError(err) {
    if (err.code === 'ECONNREFUSED') {
      return `Connection refused — MoneyPrinterTurbo tidak berjalan di ${this.endpoint}`;
    }
    const data = err.response?.data;
    if (data) {
      if (typeof data === 'string') return data.slice(0, 300);
      return JSON.stringify(data).slice(0, 300);
    }
    return err.message;
  }
}

export default new MoneyPrinterService();
