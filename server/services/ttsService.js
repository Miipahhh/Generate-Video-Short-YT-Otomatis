import { EdgeTTS } from 'edge-tts-universal';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suara neural Microsoft Edge (gratis, tanpa API key).
// Dua yang pertama asli Bahasa Indonesia. Sisanya suara "multilingual" generasi baru yang
// pelafalannya lebih luwes/ngobrol, tapi logatnya kedengaran sedikit asing saat baca teks
// Indonesia — makanya ditandai jelas di label supaya bisa dipilih sendiri sesuai selera.
export const AVAILABLE_VOICES = [
  { id: 'id-ID-GadisNeural', label: 'Gadis — perempuan, Indonesia asli' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi — laki-laki, Indonesia asli' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava — perempuan, lebih luwes (sedikit logat asing)' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma — perempuan, lebih santai (sedikit logat asing)' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew — laki-laki, lebih luwes (sedikit logat asing)' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian — laki-laki, lebih hangat (sedikit logat asing)' }
];

const PREVIEW_TEXT =
  'Oke, jadi begini. Ini contoh suara narator yang bakal dipakai di video kamu... ' +
  'coba dengar dulu ritmenya, baru pilih yang paling enak di telinga.';

// Singkatan yang memang harus dibaca huruf per huruf, jadi jangan diubah jadi huruf kecil.
const KEEP_UPPERCASE = new Set(['AI', 'CCTV', 'NASA', 'DNA', 'UFO', 'PBB', 'WHO', 'FBI', 'CIA', 'GPS', 'USB', 'PC', 'TV', 'HP', 'VR', 'AR', 'API']);

class TTSService {
  constructor() {
    const saved = dbService.getTtsConfig() || {};
    this.enabled = saved.enabled !== false;
    this.voice = saved.voice || 'id-ID-GadisNeural';
    this.rate = saved.rate || '+0%';
    this.pitch = saved.pitch || '+0Hz';
    this.audioDir = path.join(__dirname, '../../public/videos');
    if (!fs.existsSync(this.audioDir)) fs.mkdirSync(this.audioDir, { recursive: true });
  }

  updateConfig({ enabled, voice, rate, pitch }) {
    if (enabled !== undefined) this.enabled = enabled;
    if (voice) this.voice = voice;
    if (rate) this.rate = rate;
    if (pitch) this.pitch = pitch;
    dbService.saveTtsConfig({ enabled: this.enabled, voice: this.voice, rate: this.rate, pitch: this.pitch });
  }

  getConfig() {
    return {
      enabled: this.enabled,
      voice: this.voice,
      rate: this.rate,
      pitch: this.pitch,
      availableVoices: AVAILABLE_VOICES
    };
  }

  /**
   * Rapikan teks sebelum disintesis supaya pembawaannya tidak kaku/teriak-teriak.
   * Mesin TTS membentuk intonasi & jeda dari tanda baca, jadi teks yang berantakan
   * (tanda seru bertubi-tubi, KAPITAL SEMUA, emoji) langsung terdengar robotik.
   */
  humanize(text = '') {
    let out = String(text)
      // Emoji dibaca sebagai nama unicode oleh sebagian suara — buang.
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
      // Hashtag & sisa markdown dari metadata.
      .replace(/#\w+/g, '')
      .replace(/[*_`]/g, '')
      // Tanda baca bertumpuk: "!!!" / "???" → satu tanda saja.
      .replace(/([!?])\1+/g, '$1')
      // Titik empat atau lebih → elipsis jeda yang wajar.
      .replace(/\.{4,}/g, '...');

    // KAPITAL SEMUA dibaca sebagai teriakan (atau dieja) oleh mesin TTS. Turunkan jadi
    // huruf biasa, kecuali singkatan yang justru harus dieja.
    out = out.replace(/\b[A-Z][A-Z]{2,}\b/g, (word) =>
      KEEP_UPPERCASE.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()
    );

    // Terlalu banyak tanda seru bikin nada naik terus tanpa pernah turun. Sisakan satu.
    const bangs = (out.match(/!/g) || []).length;
    if (bangs > 2) {
      let seen = 0;
      out = out.replace(/!/g, () => (++seen <= 1 ? '!' : '.'));
    }

    return out
      // Beri spasi sesudah tanda baca supaya frasa tidak nempel jadi satu tarikan napas.
      // Deretan tanda baca ("...") diperlakukan sebagai satu kesatuan — kalau dipecah jadi
      // ". . ." mesin TTS membacanya sebagai tiga akhir kalimat dan jedanya patah-patah.
      .replace(/([.,!?;:]+)(?![.,!?;:])(?=\S)/g, (mark, _p1, offset, str) => {
        const before = str[offset - 1] || '';
        const after = str[offset + mark.length] || '';
        // Jangan pisahkan angka: "19.30" atau "1,5" harus tetap dibaca sebagai satu angka.
        if (mark.length === 1 && /\d/.test(before) && /\d/.test(after)) return mark;
        return `${mark} `;
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Sintesis teks narasi jadi file MP3 nyata pakai suara neural Microsoft Edge (gratis,
   * tanpa API key — layanan tidak resmi/reverse-engineered dari fitur Read Aloud Edge,
   * jadi bisa saja berhenti berfungsi kalau Microsoft mengubah sesuatu di sisi mereka).
   */
  async synthesize(text, { voice, rate, pitch, filename } = {}) {
    const clean = this.humanize(text);
    if (!clean) throw new Error('Teks narasi kosong, tidak ada yang bisa disintesis.');

    // Batas 9000 karakter (~3000 karakter cuma cukup untuk ±40 detik bicara, sementara
    // konten cerita/dongeng bisa butuh sampai 5 menit narasi).
    const tts = new EdgeTTS(clean.slice(0, 9000), voice || this.voice, {
      rate: rate || this.rate,
      volume: '+0%',
      pitch: pitch || this.pitch
    });
    const result = await tts.synthesize();
    const buffer = Buffer.from(await result.audio.arrayBuffer());

    const outName = filename || `narration_${Date.now()}.mp3`;
    const filePath = path.join(this.audioDir, outName);
    fs.writeFileSync(filePath, buffer);

    const durationSeconds = await this.getAudioDuration(filePath);
    return { filePath, filename: outName, durationSeconds };
  }

  /** Contoh suara pendek untuk tombol "Dengar contoh" di Pengaturan. */
  async synthesizePreview({ voice, rate, pitch } = {}) {
    // Selalu menimpa file yang sama supaya folder video tidak dipenuhi file contoh.
    const { filename } = await this.synthesize(PREVIEW_TEXT, {
      voice,
      rate,
      pitch,
      filename: 'tts_preview.mp3'
    });
    return { url: `/videos/${filename}?t=${Date.now()}` };
  }

  async getAudioDuration(filePath) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', filePath
      ]);
      const d = parseFloat(stdout.trim());
      return Number.isFinite(d) && d > 0 ? d : 0;
    } catch {
      return 0;
    }
  }
}

export default new TTSService();
