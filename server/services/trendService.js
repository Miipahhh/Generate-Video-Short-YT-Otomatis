import axios from 'axios';
import dbService from './dbService.js';

/**
 * Ambil topik yang lagi ramai dibicarakan di Indonesia hari ini — dipakai buat usulan topik
 * yang berangkat dari data sungguhan, bukan tebakan AI dari pengetahuan statisnya (beda dari
 * suggestRandomTopic di aiService.js).
 *
 * Awalnya dicoba pakai Google Trends (package google-trends-api + RSS feed publiknya), tapi
 * dua-duanya sudah mati (Google menghentikan endpoint publik itu — dicek langsung, balas 404).
 * Dipakai Tavily sebagai gantinya (mode topic:'news'), reuse API key yang sama dengan fitur
 * "Fakta terkini" yang sudah ada — tidak butuh signup/API key baru. Kalau Tavily nonaktif/gagal,
 * kembalikan array kosong; pemanggil (aiService.suggestTrendingTopic) fallback ke cara lama.
 */
class TrendService {
  get config() {
    return dbService.getSearchConfig() || {};
  }

  get isEnabled() {
    const { enabled, tavilyApiKey } = this.config;
    return Boolean(enabled && tavilyApiKey);
  }

  async getTrendingTopics() {
    if (!this.isEnabled) return [];
    try {
      const res = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: this.config.tavilyApiKey,
          query: 'berita dan topik yang lagi ramai dibicarakan di Indonesia hari ini',
          topic: 'news',
          search_depth: 'basic',
          max_results: 10,
          days: 1
        },
        { timeout: 15000 }
      );
      const results = Array.isArray(res.data?.results) ? res.data.results : [];
      return results
        .map((r) => ({
          title: (r.title || '').trim(),
          snippet: (r.content || '').slice(0, 220).replace(/\s+/g, ' ').trim()
        }))
        .filter((t) => t.title);
    } catch (error) {
      console.warn('[TrendService] Gagal ambil topik trending (Tavily):', error.response?.data?.detail || error.message);
      return [];
    }
  }
}

export default new TrendService();
