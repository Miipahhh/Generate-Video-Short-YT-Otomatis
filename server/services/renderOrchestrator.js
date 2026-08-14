import videoRendererService from './videoRendererService.js';
import aiVideoService from './aiVideoService.js';
import moneyPrinterService from './moneyPrinterService.js';
import ttsService from './ttsService.js';

/**
 * Pilih renderer sesuai provider aktif di Pengaturan:
 *  - 'fal_ai'      → AI Video generation penuh (fal.ai, berbayar)
 *  - 'moneyprinter' → MoneyPrinterTurbo (footage stok asli Pexels/Pixabay + subtitle otomatis)
 *  - default        → Template FFmpeg lokal (gratis, instan)
 * fal.ai tetap fallback otomatis ke template FFmpeg kalau gagal (quota habis, dll).
 * MoneyPrinterTurbo SENGAJA TIDAK fallback ke template — kalau provider ini yang dipilih,
 * user memang mau footage video asli, bukan foto+teks; kalau gagal, biarkan error
 * (dengan pesan jelas) supaya user tahu dan bisa retry, bukan diam-diam dapat hasil
 * yang beda dari yang diminta.
 */
async function renderShort({ title, narration, scenes, themeId, durationSeconds, niche, localFootage }) {
  if (aiVideoService.isEnabled) {
    try {
      return await aiVideoService.generateVideo({ title, narration, scenes, durationSeconds });
    } catch (err) {
      console.warn('[RenderOrchestrator] AI Video (fal.ai) gagal, fallback ke template FFmpeg:', err.message);
      const fallback = await videoRendererService.renderVerticalShort({ title, narration, scenes, themeId, durationSeconds });
      fallback.aiVideoFallbackReason = err.message;
      return fallback;
    }
  }

  if (moneyPrinterService.isEnabled) {
    try {
      return await moneyPrinterService.generateVideo({
        title,
        narration,
        scenes,
        durationSeconds,
        ttsVoice: ttsService.voice,
        ttsRate: ttsService.rate,
        localFootage
      });
    } catch (err) {
      console.error('[RenderOrchestrator] MoneyPrinterTurbo gagal:', err.message);
      throw new Error(`MoneyPrinterTurbo gagal render video: ${err.message}`);
    }
  }

  return videoRendererService.renderVerticalShort({ title, narration, scenes, themeId, durationSeconds });
}

export default { renderShort };
