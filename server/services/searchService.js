import axios from 'axios';
import dbService from './dbService.js';

/**
 * Pencarian web (Tavily — https://tavily.com, dirancang khusus buat grounding AI/RAG, gratis
 * 1000 pencarian/bulan) buat menyuntik FAKTA TERKINI ke naskah & cek fakta. Tanpa ini, AI
 * naskah/cek fakta cuma mengandalkan pengetahuan statis dari data latihan modelnya sendiri —
 * kejadian baru (transfer pemain, prestasi terbaru, dll) bisa saja tidak diketahui atau salah.
 * Opsional (nonaktif secara default, butuh API key sendiri) — kalau tidak diaktifkan atau gagal,
 * generate/cek fakta tetap jalan seperti biasa tanpa konteks pencarian (non-fatal).
 */
class SearchService {
  constructor() {
    const saved = dbService.getSearchConfig() || {};
    this.enabled = saved.enabled || false;
    this.apiKey = saved.tavilyApiKey || '';
  }

  updateConfig({ enabled, tavilyApiKey }) {
    if (enabled !== undefined) this.enabled = enabled;
    if (tavilyApiKey !== undefined) this.apiKey = tavilyApiKey;
    dbService.saveSearchConfig({ enabled: this.enabled, tavilyApiKey: this.apiKey });
  }

  getConfig() {
    return {
      enabled: this.enabled,
      hasApiKey: Boolean(this.apiKey && this.apiKey.length > 5)
    };
  }

  get isEnabled() {
    return this.enabled && Boolean(this.apiKey);
  }

  /**
   * Cari topik di web, kembalikan ringkasan singkat siap-tempel ke prompt AI (bukan hasil
   * mentah). Kembalikan null kalau nonaktif/gagal — pemanggil harus anggap itu sebagai
   * "tidak ada konteks tambahan", bukan error yang menggagalkan generate/cek fakta.
   */
  async searchTopic(query) {
    if (!this.isEnabled || !query || !query.trim()) return null;
    try {
      const res = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: this.apiKey,
          query: query.trim().slice(0, 400),
          search_depth: 'basic',
          include_answer: true,
          max_results: 5
        },
        { timeout: 15000 }
      );

      const answer = res.data?.answer;
      const results = Array.isArray(res.data?.results) ? res.data.results : [];
      if (!answer && results.length === 0) return null;

      const lines = [];
      if (answer) lines.push(`Ringkasan: ${answer}`);
      results.slice(0, 5).forEach((r) => {
        const title = (r.title || '').slice(0, 120);
        const snippet = (r.content || '').slice(0, 280).replace(/\s+/g, ' ').trim();
        if (title || snippet) lines.push(`- ${title}${title && snippet ? ': ' : ''}${snippet}`);
      });
      return lines.length ? lines.join('\n') : null;
    } catch (err) {
      console.warn('[SearchService] Pencarian Tavily gagal, lanjut tanpa konteks web:', err.response?.data?.detail || err.message);
      return null;
    }
  }
}

export default new SearchService();
