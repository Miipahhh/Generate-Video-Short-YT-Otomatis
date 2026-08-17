import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';
import ttsService from './ttsService.js';
import aiService from './aiService.js';

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
 * Backsound bawaan MoneyPrinterTurbo (resource/songs/output000.mp3 s/d output029.mp3) tidak
 * punya metadata mood sama sekali, jadi bgm_type:'random' dulu benar-benar comot buta —
 * video horor bisa kejatah lagu yang terdengar romantis. Daftar di bawah adalah hasil analisis
 * fitur akustik nyata (tempo/BPM, energi RMS, kecerahan spektral, mode major/minor lewat
 * korelasi profil Krumhansl-Schmuckler) atas seluruh 29 track, dikelompokkan jadi 3 level energi.
 * TEMUAN PENTING: seluruh 29 track ternyata bernada MAJOR/cerah (khas musik stok
 * "corporate/uplifting" generik) — tidak ada satupun track yang benar-benar gelap/tegang.
 * Makanya niche horor/misteri/konspirasi di resolveBgm() di bawah sengaja dimatikan
 * backsound-nya sama sekali (bukan dipaksa pilih yang "paling mendekati"), karena hening jauh
 * lebih cocok untuk horor daripada musik ceria yang tetap terasa nyeleneh.
 */
const BGM_MOOD_BUCKETS = {
  // Tempo lambat (51-103 BPM), energi & kecerahan lebih rendah — paling cocok buat konten
  // yang butuh nuansa lembut/tenang (cerita, hubungan/percintaan).
  tenang: [
    'output022.mp3', 'output010.mp3', 'output007.mp3', 'output011.mp3', 'output018.mp3',
    'output029.mp3', 'output003.mp3', 'output021.mp3', 'output002.mp3'
  ],
  // Tempo & energi menengah — default aman buat konten fakta/informasi umum.
  netral: [
    'output006.mp3', 'output017.mp3', 'output028.mp3', 'output005.mp3', 'output013.mp3',
    'output024.mp3', 'output009.mp3', 'output020.mp3', 'output004.mp3', 'output000.mp3'
  ],
  // Tempo cepat (172-185 BPM), energi & kecerahan tertinggi — buat konten yang butuh nuansa
  // semangat/upbeat (motivasi, teknologi, pop culture).
  energik: [
    'output019.mp3', 'output025.mp3', 'output008.mp3', 'output014.mp3', 'output016.mp3',
    'output015.mp3', 'output001.mp3', 'output027.mp3', 'output023.mp3', 'output012.mp3'
  ]
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
   * Pilih backsound sesuai mood niche, bukan asal random dari semua 29 track. Pakai kategori
   * mode cerita yang sudah ada di aiService (detectStoryMode) supaya konsisten dengan logika
   * naskah/durasi, bukan bikin klasifikasi niche baru yang terpisah.
   * - mystery (horor/misteri/konspirasi): backsound DIMATIKAN — lihat catatan BGM_MOOD_BUCKETS,
   *   tidak ada satupun track bawaan yang cocok, hening lebih baik daripada musik ceria dipaksakan.
   * - motivation → bucket energik, relationship/fiction → tenang, sisanya (facts, dst) → netral.
   */
  resolveBgm(niche) {
    const mode = aiService.detectStoryMode(niche || '');
    if (mode === 'mystery') {
      return { bgm_type: '', bgm_file: '', bgm_volume: 0 };
    }
    const bucketByMode = { motivation: 'energik', relationship: 'tenang', fiction: 'tenang' };
    const bucketName = bucketByMode[mode] || 'netral';
    const files = BGM_MOOD_BUCKETS[bucketName];
    const file = files[Math.floor(Math.random() * files.length)];
    return { bgm_type: 'random', bgm_file: file, bgm_volume: 0.2 };
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
   * Unduhan footage dari Pexels/Pixabay cukup sering meleset: file clip sementara turun
   * 0 byte, lalu MoneyPrinterTurbo langsung membatalkan seluruh task. Dari pengamatan,
   * mengulang task yang sama persis biasanya langsung berhasil. Jadi sekali percobaan ulang
   * dilakukan otomatis di sini — bukan menurunkan mutu hasil seperti fallback ke template,
   * cuma mencoba lagi hal yang sama.
   */
  async generateVideo(options) {
    const MAKS_PERCOBAAN = 2;
    let errorTerakhir;

    for (let percobaan = 1; percobaan <= MAKS_PERCOBAAN; percobaan++) {
      try {
        return await this.attemptGenerateVideo(options);
      } catch (err) {
        errorTerakhir = err;
        // Server mati bukan masalah sesaat — mengulang cuma menunda pesan errornya.
        if (err.message.includes('tidak terjangkau')) break;
        if (percobaan < MAKS_PERCOBAAN) {
          console.warn(`[MoneyPrinterTurbo] Percobaan ${percobaan} gagal: ${err.message} — mencoba ulang sekali.`);
        }
      }
    }

    throw errorTerakhir;
  }

  /**
   * Kirim naskah narasi yang SUDAH digenerate Hermes AI ke MoneyPrinterTurbo (field
   * video_script), supaya MPT tidak menulis ulang naskahnya sendiri — MPT hanya bertugas
   * mencocokkan footage stok, mensintesis suara (edge-tts internal), dan membakar subtitle.
   */
  async attemptGenerateVideo({ title, narration, scenes, durationSeconds, niche, ttsVoice, ttsRate, localFootage }) {
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

    // Footage sendiri (upload user, lihat footageService.js): kalau diisi, dipakai APA ADANYA
    // menggantikan pencarian stok — cocok buat topik tentang orang/momen spesifik yang memang
    // tidak akan pernah ada di Pexels/Pixabay (lihat komentar aiService.generateVideoSearchTerms
    // soal ini). Urutan array = urutan klip ditempel ke timeline (MPT tidak mengurutkan ulang
    // materi lokal), jadi harus sudah diurutkan sesuai alur scene sebelum sampai di sini.
    const useLocalFootage = Array.isArray(localFootage) && localFootage.length > 0;

    // PENTING (hanya relevan kalau BUKAN footage sendiri): kalau dibiarkan auto-generate
    // sendiri, MoneyPrinterTurbo sering menyusun kata kunci pencarian dari JUDUL/NASKAH APA
    // ADANYA — termasuk nama orang/tokoh spesifik kalau topiknya tentang seseorang (mis.
    // "Lamine Yamal champion"). Situs stok footage (Pexels/Pixabay) tidak punya rekaman orang
    // tertentu, jadi pencarian begitu nyaris selalu meleset jauh (pernah dapat video laminator
    // kertas & orang main biola untuk topik pesepakbola). Di sini kita generate kata kunci kita
    // sendiri yang sengaja generik/bebas nama, supaya pencariannya benar-benar dapat footage
    // yang related secara visual. Gagal/null → dibiarkan MPT auto-generate sendiri (non-fatal).
    const searchTerms = useLocalFootage ? null : await aiService.generateVideoSearchTerms(title, scenes);

    // Backsound dipilih sesuai mood niche (lihat resolveBgm/BGM_MOOD_BUCKETS di atas), bukan
    // asal random dari semua track — itu penyebab video horor bisa kejatah lagu romantis.
    const bgm = this.resolveBgm(niche);

    let createRes;
    try {
      createRes = await axios.post(`${this.endpoint}/api/v1/videos`, {
        video_subject: (title || 'Video Short').slice(0, 100),
        video_script: script,
        ...(searchTerms ? { video_terms: searchTerms } : {}),
        video_aspect: '9:16',
        video_clip_duration: clipDuration,
        video_count: 1,
        video_source: useLocalFootage ? 'local' : 'pexels',
        ...(useLocalFootage ? { video_materials: localFootage.map((filename) => ({ url: filename })) } : {}),
        voice_name: voiceName,
        voice_rate: voiceRate,
        subtitle_enabled: true,
        // Sebelumnya tidak pernah dikirim sama sekali, jadi MPT pakai default bawaannya
        // sendiri: font STHeitiMedium.ttc (font Tionghoa, kurang cocok buat teks Indonesia,
        // kesannya polos) dengan stroke tipis. BeVietnamPro-Bold (sudah ter-bundle di MPT,
        // resource/fonts/) jauh lebih cocok buat teks Latin/Indonesia dan lebih tebal/viral —
        // stroke hitam diperbesar juga supaya captionnya kelihatan "sudah diedit", bukan teks
        // polos nempel di video.
        // custom_position adalah persentase posisi TEPI ATAS kotak teks (bukan tengah/bawahnya),
        // lihat rumus di video.py: custom_y = (video_height - clip.h) * (custom_position/100).
        // 'bottom' bawaan (video_height*0.95) nyaris nempel tepi bawah — ketutup UI Facebook/IG
        // Reels (nama akun, caption asli, ikon like/comment/share). custom_position:70 juga masih
        // ketiban. custom_position:58 sudah aman dari UI, TAPI tepi bawah teks jadi cuma ~62% dan
        // pusat teks ~57% — itu sudah masuk area TENGAH layar, bukan sepertiga bawah, jadi terasa
        // aneh/ganggu saat ditonton (nutupin subjek utama video yang biasanya ada di tengah).
        // 75 adalah titik tengah yang pas: tepi bawah teks ~77% tinggi layar — tetap kerasa
        // seperti caption biasa di sepertiga bawah, tapi masih ada jarak aman dari UI di bawahnya.
        subtitle_position: 'custom',
        custom_position: 75,
        font_name: 'BeVietnamPro-Bold.ttf',
        font_size: 72,
        text_fore_color: '#FFFFFF',
        stroke_color: '#000000',
        stroke_width: 2.5,
        ...bgm,
        // PENTING: tanpa ini, MoneyPrinterTurbo generate kata kunci pencarian ACAK dari
        // judul+naskah, lalu mengumpulkan SEMUA footage hasil pencarian dari semua kata kunci
        // itu jadi satu kolam dan MENGACAKNYA (video_concat_mode 'random') sebelum ditempel ke
        // timeline — jadi footage sama sekali tidak mengikuti urutan/isi narasi (video tentang
        // Danau Toba bisa tiba-tiba menampilkan orang nge-gym). match_materials_to_script
        // memaksa MPT membuat kata kunci berurutan sesuai alur naskah DAN mencocokkan
        // footage per-segmen narasi (bukan diacak), supaya visual jauh lebih nyambung dengan
        // apa yang sedang dinarasikan di titik itu.
        match_materials_to_script: true,
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
          throw new Error(
            `MoneyPrinterTurbo membatalkan task ${taskId} di ${lastTask.progress ?? '?'}%. ` +
            'Penyebab paling sering: satu footage gagal diunduh dari Pexels/Pixabay sehingga ' +
            'file clip sementara kosong. Cek jendela MoneyPrinterTurbo untuk pesan aslinya.'
          );
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
      provider: useLocalFootage ? 'MoneyPrinterTurbo (footage sendiri)' : 'MoneyPrinterTurbo',
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
