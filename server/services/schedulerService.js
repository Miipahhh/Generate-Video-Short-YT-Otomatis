import cron from 'node-cron';
import aiService from './aiService.js';
import renderOrchestrator from './renderOrchestrator.js';
import youtubeService from './youtubeService.js';
import dbService from './dbService.js';

// Bank cadangan lintas genre — dipakai kalau antrean kosong DAN AI gagal mengusulkan topik
// acak, supaya auto-pilot tetap punya bahan dan hasilnya tidak itu-itu saja.
const FALLBACK_TOPIC_BANK = [
  { topic: 'Fakta mengejutkan tentang luar angkasa', niche: 'Sains & edukasi' },
  { topic: 'Dongeng klasik dengan twist modern', niche: 'Cerita fiksi pendek' },
  { topic: 'Mitologi Yunani yang jarang diceritakan', niche: 'Sejarah tersembunyi' },
  { topic: 'Misteri Segitiga Bermuda yang belum terpecahkan', niche: 'Misteri & horor' },
  { topic: 'Fakta mengejutkan artificial intelligence 2026', niche: 'Teknologi & AI' },
  { topic: 'Cerita rakyat Nusantara yang penuh pesan moral', niche: 'Cerita fiksi pendek' },
  { topic: 'Fenomena alam yang sulit dijelaskan sains', niche: 'Hewan & alam liar' },
  { topic: 'Kebiasaan kecil yang diam-diam merusak kesehatan', niche: 'Kesehatan & sains' }
];

class SchedulerService {
  constructor() {
    const saved = dbService.getSchedulerConfig() || {};
    this.isAutoPilotEnabled = saved.isAutoPilotEnabled !== false;
    this.topicQueue = saved.topicQueue || [];
    this.cronExpression = '0 18 * * 1,3,5'; // Senin, Rabu, Jumat jam 18:00
    this.cronJob = null;
  }

  /** Simpan status auto-pilot & antrean ke database.json supaya tidak hilang saat restart. */
  persist() {
    dbService.saveSchedulerConfig({
      isAutoPilotEnabled: this.isAutoPilotEnabled,
      topicQueue: this.topicQueue
    });
  }

  startScheduler(onShortCreatedCallback) {
    this.onShortCreated = onShortCreatedCallback;
    if (this.cronJob) this.cronJob.stop();

    this.cronJob = cron.schedule(this.cronExpression, async () => {
      if (!this.isAutoPilotEnabled) return;
      console.log('[Scheduler] Eksekusi jadwal otomatis berjalan...');
      try {
        await this.runNextScheduledJob();
      } catch (error) {
        console.error('[Scheduler] Eksekusi otomatis gagal:', error.message);
      }
    });
  }

  getSchedulerConfig() {
    return {
      isAutoPilotEnabled: this.isAutoPilotEnabled,
      cronExpression: this.cronExpression,
      topicQueue: this.topicQueue,
      nextScheduledRun: this.calculateNextRunTime()
    };
  }

  updateConfig({ isAutoPilotEnabled, topicQueue }) {
    if (isAutoPilotEnabled !== undefined) this.isAutoPilotEnabled = isAutoPilotEnabled;
    if (topicQueue) this.topicQueue = topicQueue;
    this.persist();
    return this.getSchedulerConfig();
  }

  addTopic({ topic, niche = 'Teknologi & AI' }) {
    const newItem = { id: 't_' + Date.now(), topic, niche, status: 'PENDING' };
    this.topicQueue.push(newItem);
    this.persist();
    return newItem;
  }

  deleteTopic(topicId) {
    this.topicQueue = this.topicQueue.filter((t) => t.id !== topicId);
    this.persist();
    return this.topicQueue;
  }

  calculateNextRunTime() {
    const now = new Date();
    const days = [1, 3, 5]; // Senin, Rabu, Jumat
    const next = new Date();
    next.setHours(18, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    while (!days.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  /**
   * Kalau antrean manual habis, minta AI usulkan topik acak lintas genre supaya auto-pilot
   * terus bervariasi. Fallback ke bank lokal kalau AI tidak terjangkau.
   */
  async getFreshRandomTopic() {
    try {
      const suggestion = await aiService.suggestRandomTopic();
      if (suggestion?.topic) {
        return { id: 'auto_' + Date.now(), topic: suggestion.topic, niche: suggestion.niche || 'Teknologi & AI' };
      }
    } catch (error) {
      console.warn('[Scheduler] Gagal minta topik acak dari AI, pakai bank lokal:', error.message);
    }
    const pick = FALLBACK_TOPIC_BANK[Math.floor(Math.random() * FALLBACK_TOPIC_BANK.length)];
    return { id: 'auto_' + Date.now(), topic: pick.topic, niche: pick.niche };
  }

  /** Generate → render → upload satu topik dari antrean (atau topik acak kalau antrean kosong). */
  async runNextScheduledJob() {
    const queued = this.topicQueue.find((t) => t.status === 'PENDING');
    const nextTopic = queued || (await this.getFreshRandomTopic());

    if (queued) {
      queued.status = 'PROCESSING';
      this.persist();
    }

    try {
      const aiContent = await aiService.generateShortContent(nextTopic.topic, nextTopic.niche);

      const renderedVideo = await renderOrchestrator.renderShort({
        title: aiContent.title,
        narration: aiContent.narration,
        scenes: aiContent.scenes,
        durationSeconds: aiContent.durationSeconds
      });

      const uploadResult = await youtubeService.uploadShort({
        title: aiContent.title,
        description: aiContent.description,
        tags: aiContent.tags,
        privacyStatus: 'public',
        videoData: renderedVideo
      });

      // Topik yang sudah jadi video dikeluarkan dari antrean, bukan ditandai selesai —
      // antrean tetap berisi hal yang benar-benar belum dikerjakan.
      if (queued) {
        this.topicQueue = this.topicQueue.filter((t) => t.id !== queued.id);
        this.persist();
      }

      const record = {
        id: 'auto_' + Date.now(),
        topic: nextTopic.topic,
        niche: nextTopic.niche,
        title: aiContent.title,
        description: aiContent.description,
        tags: aiContent.tags,
        narration: aiContent.narration,
        scenes: aiContent.scenes,
        renderedVideo,
        uploadResult,
        createdAt: new Date().toISOString(),
        type: 'AUTO_SCHEDULED'
      };

      if (this.onShortCreated) this.onShortCreated(record);
      return record;
    } catch (error) {
      // Kembalikan topik ke antrean supaya bisa dicoba lagi di jadwal berikutnya.
      if (queued) {
        queued.status = 'PENDING';
        this.persist();
      }
      console.error('[Scheduler] Gagal menjalankan job:', error.message);
      throw error;
    }
  }
}

export default new SchedulerService();
