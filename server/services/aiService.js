import axios from 'axios';
import dbService from './dbService.js';

class AIService {
  constructor() {
    const savedConfig = dbService.getAiConfig() || {};
    this.apiEndpoint = savedConfig.aiEndpoint || 'https://api.openrouter.ai/api/v1';
    this.apiKey = savedConfig.apiKey || '';
    this.model = savedConfig.model || 'oc/deepseek-v4-flash-free';
  }

  /**
   * Parse JSON dari respons model AI dengan toleransi: sebagian model "reasoning" (mis.
   * deepseek-v4-flash-free lewat combo hermes 9Router) suka membungkus JSON dengan komentar/
   * catatan berpikir di luar blok JSON-nya. Coba parse langsung dulu, kalau gagal coba ekstrak
   * substring dari '{' pertama sampai '}' terakhir sebelum menyerah.
   */
  parseAiJson(rawContent) {
    const cleanJson = (rawContent || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleanJson);
    } catch {
      const start = cleanJson.indexOf('{');
      const end = cleanJson.lastIndexOf('}');
      if (start !== -1 && end > start) {
        return JSON.parse(cleanJson.slice(start, end + 1));
      }
      throw new Error('Respons AI bukan JSON valid (kemungkinan model mencampur teks penjelasan dengan JSON).');
    }
  }

  updateConfig({ apiEndpoint, apiKey, model }) {
    if (apiEndpoint) this.apiEndpoint = apiEndpoint;
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (model) this.model = model;
  }

  getConfig() {
    return {
      apiEndpoint: this.apiEndpoint,
      apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : '',
      hasApiKey: Boolean(this.apiKey && this.apiKey.length > 5),
      model: this.model
    };
  }

  /**
   * Menghasilkan paket konten YouTube Shorts lengkap:
   * Judul, Deskripsi, Tag, Naskah Narasi, dan Scene Breakdown untuk video vertikal 9:16
   */
  async generateShortContent(topic = 'Fakta Unik AI & Teknologi Masa Depan', niche = 'Teknologi & AI', tone = 'Energik & Viral', targetDurationSeconds = null) {
    // Durasi & jumlah scene menyesuaikan jenis konten: cerita/dongeng/misteri butuh napas
    // panjang buat membangun plot (3-5 menit), sementara fakta/tips singkat cukup padat di
    // 60-90 detik (minimal 60 detik supaya informasinya nggak kepotong kependekan).
    const storyMode = this.detectStoryMode(niche);
    const isNarrative = storyMode === 'fiction' || storyMode === 'mystery';

    let targetDurationLabel;
    let targetSceneGuidance;
    let exampleDuration;

    // User bisa menimpa perkiraan otomatis lewat dropdown "Target durasi" di Studio —
    // kalau diisi, prompt dipaksa mengikuti angka itu persis, bukan rentang tebakan niche.
    if (Number.isFinite(targetDurationSeconds) && targetDurationSeconds >= 15) {
      const clamped = Math.min(Math.max(Math.round(targetDurationSeconds), 15), 360);
      targetDurationLabel = `${clamped} detik (target pasti dari user, WAJIB dipenuhi — bukan cuma perkiraan)`;
      // Sama seperti pembagian jumlah scene otomatis di bawah: narasi butuh lebih banyak
      // "napas" per scene daripada fakta padat.
      const secondsPerScene = isNarrative ? 25 : 10;
      const sceneCount = Math.min(Math.max(Math.round(clamped / secondsPerScene), 3), 16);
      targetSceneGuidance = `tepat ${sceneCount} scene (satu scene mewakili sekitar ${Math.round(clamped / sceneCount)} detik narasi)`;
      exampleDuration = clamped;
    } else {
      targetDurationLabel = isNarrative ? '180-360 detik (3-6 menit)' : '60-90 detik (minimal 60 detik)';
      // Jumlah scene narrative sengaja dibatasi ke 12-16 (bukan lebih banyak lagi) supaya total
      // output JSON tidak terlalu besar — versi 15-25 scene sebelumnya bikin generation time
      // reasoning model di 9Router konsisten kena timeout untuk topik cerita panjang. Durasi
      // sampai 6 menit dicapai lewat narasi per scene yang lebih panjang (20-30 detik), bukan
      // menambah jumlah scene lebih banyak lagi.
      targetSceneGuidance = isNarrative
        ? 'sekitar 12-16 scene (satu scene mewakili sekitar 20-30 detik narasi) supaya alur cerita tetap punya ruang buat pembukaan, konflik, klimaks, dan penutup tanpa scene yang berlebihan'
        : 'sekitar 6-10 scene (satu scene tiap kira-kira 8-12 detik)';
      exampleDuration = isNarrative ? 270 : 65;
    }

    const prompt = `Kamu adalah pakar kreator YouTube Shorts viral dengan jutaan penonton.
Tugasmu adalah membuat konten YouTube vertikal (9:16) berdurasi ${targetDurationLabel} dengan topik: "${topic}" dalam kategori niche: "${niche}" dengan gaya bicara "${tone}".
Buat jumlah scene sesuai kebutuhan supaya menutupi SELURUH durasi target di atas — jangan berhenti di 4 scene kalau durasinya panjang. Untuk konten ini, buat ${targetSceneGuidance}. Tiap objek scene memakai struktur JSON PERSIS seperti contoh di bawah (sceneNumber, timeRange, visualDescription, captionText, narrationSegment), tinggal ditambah sejumlah scene yang dibutuhkan.

GAYA BAHASA NARASI — PALING PENTING, ini yang bakal dibacakan suara AI, jadi harus terdengar seperti orang ngobrol, bukan teks yang dibaca robot:
- Pakai bahasa lisan sehari-hari yang santai. Sapa penonton dengan "kamu".
- Panjang kalimat DIVARIASIKAN: selingi kalimat pendek (3-6 kata) di antara kalimat panjang, supaya ada ritme dan tempat menarik napas.
- Pakai koma untuk jeda alami, dan titik tiga (...) kalau butuh jeda dramatis. Jangan bikin kalimat beranak-pinak dengan banyak anak kalimat.
- Maksimal 2 tanda seru di SELURUH naskah. Nada semangat dibentuk lewat pilihan kata, bukan lewat tanda seru bertubi-tubi.
- HARAM pakai klise pembuka: "Tahukah kamu", "Pernahkah kamu", "Di era digital ini", "Siapa sangka", "Mari kita simak", "Tanpa berlama-lama lagi".
- Hindari kata kaku/formal: "merupakan", "sehingga", "oleh karena itu", "dengan demikian", "sangat luar biasa", "hal tersebut". Ganti dengan versi lisan: "adalah/itu", "jadi", "makanya", "gila sih", "itu".
- Boleh pakai kata sambung obrolan sesekali di awal kalimat: "Nah", "Tapi", "Soalnya", "Jadi", "Dan anehnya".
- Jangan mengulang subjek yang sama di tiap kalimat, dan jangan menutup tiap scene dengan kalimat ajakan.
- Naskah harus mengalir antar scene: kalimat terakhir sebuah scene menyambung ke scene berikutnya, bukan berdiri sendiri-sendiri.
- JANGAN tulis narasi dengan HURUF KAPITAL SEMUA (kapital semua hanya untuk "captionText" di layar, bukan untuk suara).

KEMBALIKAN OUTPUT DALAM FORMAT JSON MURNI TANPA MARKDOWN ATAU TEKS LAIN, dengan skema:
{
  "title": "Judul viral singkat maks 55 karakter + emoji + #shorts",
  "description": "Deskripsi YouTube menarik dengan hook kuat, penjelasan singkat, kata kunci SEO, dan 5 hashtag relevan",
  "tags": "tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12, tag13, tag14, tag15",
  "narration": "Teks lengkap narasi suara mengikuti GAYA BAHASA di atas — gabungan mulus semua narrationSegment, hook di 3 detik pertama, panjangnya menyesuaikan durationSeconds di bawah",
  "durationSeconds": ${exampleDuration},
  "scenes": [
    {
      "sceneNumber": 1,
      "timeRange": "00:00 - 00:05",
      "visualDescription": "Visual hook dramatis bergaya modern tech sci-fi, teks besar menyala di tengah layar",
      "captionText": "FAKTA GILA AI YANG KAMU GAK TAU!",
      "narrationSegment": "Lima detik. Cuma segitu waktu yang dibutuhkan AI sekarang buat bikin satu video utuh."
    },
    {
      "sceneNumber": 2,
      "timeRange": "00:05 - 00:18",
      "visualDescription": "Animasi kode neon dan robot futuristik bekerja otomatis di cloud server",
      "captionText": "KERJA OTOMATIS 24 JAM!",
      "narrationSegment": "Dia riset topiknya sendiri, nulis naskahnya sendiri, terus upload sendiri ke YouTube. Tiga kali seminggu, tanpa disentuh manusia sama sekali."
    },
    {
      "sceneNumber": 3,
      "timeRange": "00:18 - 00:32",
      "visualDescription": "Grafik subscriber YouTube meledak tajam ke atas dengan nuansa cyberpunk",
      "captionText": "ALGORITMA SUKA KONSISTENSI!",
      "narrationSegment": "Nah, di sini menariknya. Algoritma Shorts itu sayang sama channel yang rutin... dan jadwal otomatis bikin kamu rutin tanpa harus mikir."
    },
    {
      "sceneNumber": 4,
      "timeRange": "00:32 - 00:40",
      "visualDescription": "Tombol subscribe berdenyut neon emas dengan efek partikel kaca",
      "captionText": "FOLLOW UNTUK TIPS LAINNYA!",
      "narrationSegment": "Kalau kamu penasaran gimana cara setupnya, tinggal follow. Besok aku bongkar sisanya."
    }
  ]
}
CATATAN: 4 scene di atas cuma contoh FORMAT. Untuk topik ini kamu WAJIB membuat total ${targetSceneGuidance}, dengan jumlah kata di "narration" (gabungan semua narrationSegment) yang cukup panjang untuk dibacakan selama kurang lebih ${exampleDuration} detik (perkirakan ±2.5 kata Indonesia per detik).`;

    // Coba panggil API (9Router lokal atau OpenRouter)
    // Untuk localhost 9Router, auth opsional — endpoint local bisa tanpa key
    const headers = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-shorts-studio.local',
      'X-Title': 'AI YouTube Shorts Studio'
    };
    if (this.apiKey && this.apiKey.length > 0) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastErrorMessage = 'Alasan tidak diketahui';

    // Coba 1: endpoint yang terdaftar + model yang dikonfigurasi.
    // Timeout dinaikkan ke 340s (dari 240s) — diukur langsung, prompt konten cerita panjang
    // (3-5 menit, ~10-14 scene) ke combo hermes 9Router bisa konsisten butuh 3+ menit karena
    // sebagian model underlying di combo ini adalah model "reasoning" yang menghabiskan banyak
    // token cuma buat proses berpikir sebelum jawaban final.
    // Dicoba sampai 2x dengan model yang sama: model "combo" (mis. hermes) me-routing acak ke
    // beberapa provider underlying, jadi satu percobaan gagal (mis. provider tertentu lagi tidak
    // ada kredensial) bukan berarti modelnya benar-benar tidak bisa dipakai.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await axios.post(
          `${this.apiEndpoint}/chat/completions`,
          {
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are an AI YouTube Shorts expert. Always return valid JSON only.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 8000,
            stream: false
          },
          { headers, timeout: 340000 }
        );

        const rawContent = response.data?.choices?.[0]?.message?.content || '';
        const parsed = this.parseAiJson(rawContent);
        return {
          ...parsed,
          generatedBy: `${this.model} via 9Router`,
          generatedAt: new Date().toISOString()
        };
      } catch (error) {
        lastErrorMessage = this.describeAxiosError(error);
        console.warn(`AI API call gagal dengan model ${this.model} (percobaan ${attempt}/2):`, lastErrorMessage);
        if (attempt === 2) {
          // Fallback 1: coba model 'hermes' (combo 9Router — paling stabil)
          if (this.model !== 'hermes') {
            try {
              const response = await axios.post(
                `${this.apiEndpoint}/chat/completions`,
                {
                  model: 'hermes',
                  messages: [
                    { role: 'system', content: 'You are an AI YouTube Shorts expert. Always return valid JSON only.' },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.7,
                  stream: false
                },
                { headers, timeout: 150000 }
              );
              const rawContent = response.data?.choices?.[0]?.message?.content || '';
              const parsed = this.parseAiJson(rawContent);
              return {
                ...parsed,
                generatedBy: `hermes (9Router) — fallback dari ${this.model}`,
                generatedAt: new Date().toISOString()
              };
            } catch (err2) {
              lastErrorMessage = this.describeAxiosError(err2);
              console.warn('Fallback ke hermes juga gagal:', lastErrorMessage);
            }
          }

          // Fallback 2: coba model cadangan lain.
          // Kalau endpoint-nya 9Router lokal, ID model OpenRouter (meta-llama/..., dll) TIDAK
          // ada di 9Router — selalu gagal "no active credentials", jadi bukan cadangan yang
          // berguna. Model individual (qwen/gh/dll) di 9Router JUGA sering tanpa kredensial di
          // instalasi lokal — cuma model "combo" (hermes/Free/RequirementBusinessAnalysis) yang
          // benar-benar tersambung ke provider asli. RequirementBusinessAnalysis diverifikasi
          // rutenya ke Claude Sonnet — cepat & stabil, jadi cadangan paling masuk akal.
          const isLocal9Router = this.apiEndpoint.includes('localhost') || this.apiEndpoint.includes('127.0.0.1');
          const freeModels = isLocal9Router
            ? ['RequirementBusinessAnalysis', 'Free']
            : ['meta-llama/llama-3.1-8b-instruct:free', 'google/gemma-2-9b-it:free', 'mistralai/mistral-7b-instruct:free'];
          if (isLocal9Router || (this.apiKey && this.apiKey.length > 5)) {
            for (const modelCandidate of freeModels) {
              try {
                const response = await axios.post(
                  `${this.apiEndpoint}/chat/completions`,
                  {
                    model: modelCandidate,
                    messages: [
                      { role: 'system', content: 'You are an AI YouTube Shorts expert. Always return valid JSON only.' },
                      { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    stream: false
                  },
                  { headers, timeout: 60000 }
                );
                const rawContent = response.data?.choices?.[0]?.message?.content || '';
                const parsed = this.parseAiJson(rawContent);
                return {
                  ...parsed,
                  generatedBy: isLocal9Router ? `${modelCandidate} via 9Router (fallback cepat)` : `Free AI (${modelCandidate}) via OpenRouter`,
                  generatedAt: new Date().toISOString()
                };
              } catch (err2) {
                lastErrorMessage = this.describeAxiosError(err2);
                console.warn(`Fallback model ${modelCandidate} juga gagal:`, lastErrorMessage);
              }
            }
          }
        } // end if (attempt === 2)
      } // end catch
    } // end for attempt

    // Smart Generator untuk menghasilkan konten viral relevan sesuai topik/niche,
    // dengan alasan kegagalan sungguhan disertakan (bukan pesan generik) supaya kelihatan
    // di UI apa yang benar-benar terjadi (timeout, connection refused, dll).
    return this.generateSmartFallback(topic, niche, tone, lastErrorMessage);
  }

  /**
   * Minta AI menilai klaim faktual di naskah narasi. PENTING: ini pemeriksaan oleh model
   * bahasa YANG SAMA yang menulis naskahnya, bukan pencarian internet sungguhan — jadi
   * hasilnya cuma saringan awal (bisa saja model salah menilai atau tidak tahu suatu fakta),
   * bukan sumber kebenaran akhir. Disclaimer ini juga ditampilkan di UI (ShortsStudioView).
   */
  async factCheckNarration(narration = '', topic = '') {
    const text = (narration || '').trim();
    if (!text) {
      throw new Error('Naskah narasi kosong, tidak ada yang bisa dicek.');
    }

    const prompt = `Kamu adalah fact-checker yang teliti dan skeptis. Baca naskah narasi video pendek berikut (topik: "${topic}") dan identifikasi klaim FAKTUAL di dalamnya — pernyataan yang bisa benar/salah secara objektif (angka, kejadian, sifat sesuatu), BUKAN opini, gaya bahasa, atau ajakan follow/subscribe.

Untuk tiap klaim faktual, nilai dengan salah satu dari 4 kategori persis ini:
- "akurat": sesuai pengetahuan umum yang kamu tahu
- "meragukan": terdengar dibesar-besarkan, disederhanakan berlebihan, atau butuh konteks tambahan supaya tidak menyesatkan
- "keliru": bertentangan dengan pengetahuan umum yang kamu tahu
- "tidak_bisa_dipastikan": klaim spesifik (angka presisi, kejadian lokal/personal, detail niche) yang tidak bisa kamu pastikan benar/salahnya dari pengetahuan umum

Kalau naskahnya cerita fiksi atau tidak mengandung klaim faktual sama sekali, kembalikan claims array kosong dan jelaskan itu di overallNote.

Naskah:
"""
${text}
"""

KEMBALIKAN OUTPUT JSON MURNI TANPA MARKDOWN, skema:
{
  "claims": [
    { "claim": "kutipan/ringkasan klaim, maks 120 karakter", "verdict": "akurat" | "meragukan" | "keliru" | "tidak_bisa_dipastikan", "note": "alasan singkat, maks 140 karakter" }
  ],
  "overallNote": "ringkasan umum 1-2 kalimat tentang keandalan naskah ini secara keseluruhan"
}`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey && this.apiKey.length > 0) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const callModel = async (model, timeout) => {
      const response = await axios.post(
        `${this.apiEndpoint}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: 'You are a skeptical fact-checker. Always return valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 1800,
          stream: false
        },
        { headers, timeout }
      );
      const rawContent = response.data?.choices?.[0]?.message?.content || '';
      return this.parseAiJson(rawContent);
    };

    // Model "combo" (mis. RequirementBusinessAnalysis) me-routing acak ke beberapa provider
    // underlying di 9Router, jadi satu percobaan gagal bukan berarti modelnya benar-benar
    // tidak bisa dipakai — pola yang sama seperti generateShortContent di atas. Tanpa retry
    // ini, cek fakta sesekali gagal total padahal generate naskah (pakai model yang sama)
    // baru saja berhasil.
    try {
      const parsed = await callModel(this.model, 60000);
      return {
        claims: Array.isArray(parsed.claims) ? parsed.claims : [],
        overallNote: parsed.overallNote || '',
        checkedBy: `${this.model} via 9Router`,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Cek fakta gagal dengan model', this.model, '— mencoba ulang:', this.describeAxiosError(error));
      try {
        const fallbackModel = this.model === 'hermes' ? 'RequirementBusinessAnalysis' : 'hermes';
        const parsed = await callModel(fallbackModel, 60000);
        return {
          claims: Array.isArray(parsed.claims) ? parsed.claims : [],
          overallNote: parsed.overallNote || '',
          checkedBy: `${fallbackModel} via 9Router (percobaan ke-2)`,
          checkedAt: new Date().toISOString()
        };
      } catch (error2) {
        throw new Error(`Gagal menjalankan cek fakta: ${this.describeAxiosError(error2)}`);
      }
    }
  }

  /** Ekstrak pesan error yang berguna dari axios error (timeout, connection refused, body API, dll) */
  describeAxiosError(err) {
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
      return `Timeout — 9Router/AI tidak merespons dalam batas waktu (${err.message})`;
    }
    if (err.code === 'ECONNREFUSED') {
      return `Connection refused — 9Router tidak berjalan di endpoint yang dikonfigurasi (${err.message})`;
    }
    const data = err.response?.data;
    if (data) {
      if (typeof data === 'string') return data.slice(0, 200);
      return JSON.stringify(data).slice(0, 200);
    }
    return err.message;
  }

  /**
   * Minta AI mengusulkan SATU ide topik acak lintas genre (bukan cuma teknologi),
   * termasuk cerita fiksi/horor/misteri, supaya Studio tidak terpatok topik itu-itu saja.
   * Kalau AI tidak terjangkau, jatuh ke bank topik lokal yang juga diacak.
   */
  async suggestRandomTopic() {
    const categories = [
      'Teknologi & AI', 'Misteri & Horor', 'Cerita Fiksi Pendek', 'Psikologi & Fakta Sosial',
      'Sejarah Tersembunyi', 'Keuangan & Investasi', 'Kesehatan & Sains', 'Hewan & Alam Liar',
      'Konspirasi & Urban Legend', 'Hubungan & Percintaan', 'Motivasi & Karir', 'Game & Pop Culture'
    ];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const tones = ['Energik & Viral', 'Misterius & Penasaran', 'Santai & Relatable', 'Dramatis & Menegangkan'];
    const tone = tones[Math.floor(Math.random() * tones.length)];

    const prompt = `Kamu adalah trend-spotter konten YouTube Shorts/TikTok Indonesia yang jago cari ide yang berpotensi viral.
Berikan SATU ide topik video Shorts baru dalam kategori "${category}" — bisa berupa fakta, cerita fiksi pendek, atau narasi dramatis, TIDAK harus tentang AI/teknologi kecuali kategorinya memang itu.
KEMBALIKAN OUTPUT JSON MURNI TANPA MARKDOWN, skema:
{"topic": "judul singkat ide topik, maks 80 karakter", "niche": "${category}"}`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey && this.apiKey.length > 0) headers['Authorization'] = `Bearer ${this.apiKey}`;

    try {
      const response = await axios.post(
        `${this.apiEndpoint}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a viral short-video trend spotter. Always return valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.95,
          max_tokens: 200,
          stream: false
        },
        { headers, timeout: 20000 }
      );
      const rawContent = response.data?.choices?.[0]?.message?.content || '';
      const parsed = this.parseAiJson(rawContent);
      return { topic: parsed.topic, niche: parsed.niche || category, tone };
    } catch (error) {
      console.warn('Gagal minta ide topik acak dari AI, pakai bank topik lokal:', error.message);
      return this.getRandomFallbackTopic(category, tone);
    }
  }

  getRandomFallbackTopic(preferredCategory, tone) {
    const bank = {
      'Teknologi & AI': ['Fakta AI yang Bakal Ganti Pekerjaan Manusia', 'Gadget Rahasia yang Baru Dirilis Diam-Diam', 'AI vs Manusia: Siapa Menang di 2026'],
      'Misteri & Horor': ['Misteri Rumah Kosong yang Gak Pernah Terpecahkan', 'Kejadian Aneh yang Direkam CCTV Tengah Malam', 'Legenda Urban yang Ternyata Fakta'],
      'Cerita Fiksi Pendek': ['Cerita Singkat: Surat dari Masa Depan', 'Fiksi: Robot yang Belajar Merasa Sedih', 'Cerita Horor Singkat: Suara di Lorong Apartemen'],
      'Psikologi & Fakta Sosial': ['Kenapa Orang Susah Mengaku Salah', 'Trik Psikologi Biar Disukai Orang Baru Kenal', 'Fakta Aneh Soal Cara Otak Membuat Keputusan'],
      'Sejarah Tersembunyi': ['Fakta Sejarah yang Sengaja Ditutupi', 'Kejadian Bersejarah yang Nyaris Mengubah Dunia', 'Rahasia di Balik Bangunan Kuno Terkenal'],
      'Keuangan & Investasi': ['Kesalahan Keuangan yang Bikin Orang Tetap Miskin', 'Cara Kerja Uang yang Gak Diajarin di Sekolah', 'Investasi Kecil yang Berubah Jadi Kekayaan Besar'],
      'Kesehatan & Sains': ['Fakta Tubuh Manusia yang Bikin Kaget', 'Kebiasaan Kecil yang Diam-Diam Merusak Kesehatan', 'Eksperimen Sains yang Hasilnya Gak Terduga'],
      'Hewan & Alam Liar': ['Hewan dengan Kemampuan Bertahan Hidup Paling Gila', 'Fenomena Alam yang Sulit Dijelaskan Sains', 'Hewan Purba yang Ternyata Masih Ada'],
      'Konspirasi & Urban Legend': ['Teori Konspirasi yang Ternyata Ada Benarnya', 'Urban Legend Populer & Fakta di Baliknya', 'Rahasia yang Katanya Disembunyikan Pemerintah'],
      'Hubungan & Percintaan': ['Tanda Hubungan Sehat yang Sering Diabaikan', 'Kesalahan Umum di Awal Hubungan', 'Cara Mengenali Red Flag Sebelum Terlambat'],
      'Motivasi & Karir': ['Kebiasaan Orang Sukses Sebelum Jam 8 Pagi', 'Alasan Kerja Keras Aja Gak Cukup', 'Skill yang Wajib Dikuasai Sebelum 2030'],
      'Game & Pop Culture': ['Easter Egg Tersembunyi di Game Populer', 'Fakta di Balik Layar Film yang Jarang Diketahui', 'Tren Budaya Pop yang Lagi Viral Sekarang']
    };
    const list = bank[preferredCategory] || bank['Teknologi & AI'];
    const topic = list[Math.floor(Math.random() * list.length)];
    return { topic, niche: preferredCategory, tone };
  }

  /**
   * Deteksi "mode cerita" dari niche, supaya naskah fallback lokal punya struktur & gaya bahasa
   * yang sesuai (cerita fiksi beneran, misteri yang bikin penasaran, atau fakta yang mengalir),
   * bukan satu skrip generik yang sama untuk semua topik.
   */
  detectStoryMode(niche = '') {
    const n = niche.toLowerCase();
    if (n.includes('fiksi') || n.includes('cerita')) return 'fiction';
    if (n.includes('misteri') || n.includes('horor') || n.includes('konspirasi')) return 'mystery';
    if (n.includes('motivasi') || n.includes('karir')) return 'motivation';
    if (n.includes('hubungan') || n.includes('percintaan')) return 'relationship';
    return 'facts';
  }

  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /**
   * Generator naskah lokal (dipakai HANYA kalau AI utama & semua fallback API gagal dihubungi,
   * misalnya 9Router lokal belum jalan). Beda dari versi lama, ini menyusun narasi & caption yang
   * benar-benar bercerita tentang topiknya sendiri (bukan iklan generik soal "AI Shorts Studio"),
   * dengan struktur & gaya bahasa yang berubah-ubah sesuai niche, dan sedikit variasi acak supaya
   * tidak selalu terasa sama persis di tiap generate.
   */
  generateSmartFallback(topic, niche, tone, reason = '') {
    const mode = this.detectStoryMode(niche);
    const t = topic.trim();

    const templates = {
      fiction: {
        hooks: [
          `Ini kisah tentang ${t}, dan percayalah, endingnya nggak akan kamu tebak.`,
          `Bayangkan kamu ada di posisi ini: ${t}. Begini ceritanya.`,
          `Semua berawal dari hal sepele soal ${t}, sampai akhirnya semua berubah.`
        ],
        builds: [
          `Awalnya semua terlihat biasa saja, sampai satu kejadian kecil membuat semuanya berubah arah.`,
          `Setiap detail yang tampak kecil ternyata jadi kunci dari apa yang terjadi selanjutnya.`,
          `Perlahan, potongan-potongan ceritanya mulai terhubung satu sama lain.`
        ],
        climaxes: [
          `Dan ketika kebenarannya terungkap, semua orang yang mendengarnya terdiam.`,
          `Ternyata jawabannya jauh lebih mengejutkan dari yang siapa pun kira.`,
          `Di titik itulah semuanya masuk akal — dan itu yang bikin merinding.`
        ],
        resolutions: [
          `Ceritanya berakhir dengan satu pelajaran: hal terkecil sekalipun bisa mengubah segalanya.`,
          `Sejak hari itu, semua yang terlibat sepakat untuk nggak pernah menganggap remeh hal seperti ini lagi.`,
          `Dan begitulah kisah ini akhirnya selesai — jauh lebih berkesan dari yang siapa pun bayangkan di awal.`
        ],
        ctas: [
          `Kalau kamu suka cerita kayak gini, follow biar nggak ketinggalan part selanjutnya!`,
          `Komen di bawah menurut kamu endingnya gimana, ya!`
        ]
      },
      mystery: {
        hooks: [
          `Ada satu hal soal ${t} yang sampai sekarang bikin banyak orang penasaran.`,
          `Kalau kamu dengar soal ${t}, kamu bakal mikir dua kali sebelum tidur malam ini.`,
          `Ini fakta soal ${t} yang jarang diomongin orang, tapi begitu tahu, susah dilupain.`
        ],
        builds: [
          `Banyak yang mencoba mencari penjelasan logisnya, tapi selalu ada bagian yang nggak nyambung.`,
          `Semakin digali, semakin banyak pertanyaan baru yang muncul dibanding jawabannya.`,
          `Beberapa saksi cerita hal yang mirip, padahal mereka nggak saling kenal.`
        ],
        climaxes: [
          `Sampai sekarang, belum ada yang bisa menjelaskan ini secara pasti.`,
          `Yang bikin makin aneh, pola kejadiannya terus berulang dari waktu ke waktu.`,
          `Sebagian orang percaya ini kebetulan. Sebagian lagi yakin ada sesuatu yang lebih besar di baliknya.`
        ],
        resolutions: [
          `Yang jelas, kejadian ini sudah tercatat di banyak laporan, dan jadi salah satu misteri yang paling banyak diperbincangkan sampai sekarang.`,
          `Sampai ada bukti baru muncul, ini akan terus jadi salah satu misteri yang belum terpecahkan.`,
          `Satu hal yang pasti: cerita ini nggak akan berhenti dibicarakan dalam waktu dekat.`
        ],
        ctas: [
          `Menurut kamu ini kebetulan atau ada penjelasan lain? Tulis di komentar.`,
          `Follow kalau kamu suka cerita-cerita yang bikin penasaran kayak gini!`
        ]
      },
      motivation: {
        hooks: [
          `Kalau kamu masih ragu soal ${t}, coba dengar ini dulu.`,
          `Ada satu pelajaran soal ${t} yang mengubah cara banyak orang berpikir.`,
          `${t} — kedengarannya sederhana, tapi dampaknya besar kalau kamu paham ini.`
        ],
        builds: [
          `Kebanyakan orang gagal bukan karena kurang usaha, tapi karena nggak sadar hal ini dari awal.`,
          `Perbedaan antara yang berhasil dan yang stuck seringnya ada di satu kebiasaan kecil ini.`,
          `Ini bukan soal bakat, tapi soal konsistensi yang jarang orang mau jalani.`
        ],
        climaxes: [
          `Begitu kamu terapkan ini, kamu bakal lihat hasilnya nggak butuh waktu lama.`,
          `Orang-orang yang berhasil biasanya sudah sadar soal ini jauh sebelum yang lain.`,
          `Ini yang membedakan mereka yang cuma mimpi, dengan yang benar-benar sampai tujuan.`
        ],
        resolutions: [
          `Jadi mulai sekarang, coba terapkan ini pelan-pelan — perubahan besar biasanya dimulai dari langkah kecil yang konsisten.`,
          `Intinya, kamu nggak perlu sempurna dari awal, cukup mulai dan konsisten menjalankannya.`,
          `Pada akhirnya, yang membedakan bukan siapa yang paling pintar, tapi siapa yang paling konsisten menjalankannya.`
        ],
        ctas: [
          `Simpan video ini buat pengingat, dan follow buat tips lainnya!`,
          `Kalau ini bermanfaat, share ke orang yang butuh dengar ini juga.`
        ]
      },
      relationship: {
        hooks: [
          `Soal ${t}, ini hal yang sering banget luput disadari orang.`,
          `Kalau kamu lagi mikirin ${t}, video ini buat kamu.`,
          `${t} itu simpel, tapi banyak orang salah paham soal ini.`
        ],
        builds: [
          `Banyak hubungan yang sebenarnya bisa diselamatkan, kalau saja hal ini disadari lebih awal.`,
          `Komunikasi yang kelihatannya kecil, ternyata paling sering jadi akar masalahnya.`,
          `Ini bukan soal siapa yang benar, tapi soal siapa yang mau lebih dulu mengerti.`
        ],
        climaxes: [
          `Begitu kamu paham ini, cara kamu melihat hubungan bisa berubah total.`,
          `Yang paling penting bukan soal siapa lebih sayang, tapi siapa yang mau bertahan saat susah.`,
          `Dan biasanya, hubungan yang sehat justru dibangun dari hal-hal kecil seperti ini.`
        ],
        resolutions: [
          `Jadi kalau kamu masih di tahap belajar soal ini, nggak apa-apa — yang penting mau terus berusaha mengerti satu sama lain.`,
          `Hubungan yang bertahan lama biasanya bukan yang paling sempurna, tapi yang paling mau saling belajar.`,
          `Dan itu jugalah yang akhirnya bikin sebuah hubungan terasa layak diperjuangkan.`
        ],
        ctas: [
          `Share ke pasangan kamu kalau ini related banget!`,
          `Follow buat pembahasan hubungan yang relate lainnya.`
        ]
      },
      facts: {
        hooks: [
          `Tahukah kamu fakta soal ${t} ini?`,
          `Ini fakta soal ${t} yang mungkin belum pernah kamu dengar.`,
          `Kebanyakan orang salah paham soal ${t} — ini faktanya.`
        ],
        builds: [
          `Faktanya, ini terjadi karena beberapa hal yang jarang dibahas secara terbuka.`,
          `Penelitian dan pengamatan soal ini menunjukkan hasil yang cukup mengejutkan.`,
          `Semakin dalam ditelusuri, semakin jelas kenapa ini penting untuk diketahui.`
        ],
        climaxes: [
          `Dan itulah kenapa hal ini punya dampak lebih besar dari yang kelihatannya.`,
          `Begitu kamu tahu ini, kamu bakal melihatnya dengan cara yang beda mulai sekarang.`,
          `Fakta ini mengubah cara banyak orang memandang topik ini secara keseluruhan.`
        ],
        resolutions: [
          `Jadi lain kali kamu dengar soal ini, kamu bakal punya sudut pandang yang lebih lengkap dari kebanyakan orang.`,
          `Itulah kenapa fakta ini penting untuk terus disebarkan, biar makin banyak yang paham konteksnya.`,
          `Sekarang kamu tahu faktanya — tinggal kamu pilih mau pakai informasi ini buat apa.`
        ],
        ctas: [
          `Follow buat fakta-fakta menarik lainnya tiap hari!`,
          `Share ke temanmu yang juga perlu tahu fakta ini.`
        ]
      }
    };

    const bank = templates[mode];
    const hook = this.pick(bank.hooks);
    const build = this.pick(bank.builds);
    const climax = this.pick(bank.climaxes);
    const resolution = this.pick(bank.resolutions);
    const cta = this.pick(bank.ctas);

    const captionSets = {
      fiction: ['CERITA INI NYATA?!', 'SEMUA BERUBAH DI SINI', 'TWIST-NYA GA NYANGKA', 'INILAH AKHIRNYA', 'FOLLOW BUAT LANJUTANNYA'],
      mystery: ['MASIH JADI MISTERI', 'SEMAKIN ANEH DIGALI', 'BELUM ADA JAWABAN PASTI', 'FAKTANYA SAMPAI SEKARANG', 'MENURUTMU GIMANA?'],
      motivation: ['INI BEDANYA', 'BUKAN SOAL BAKAT', 'HASILNYA KELIHATAN CEPAT', 'MULAI DARI SEKARANG', 'SIMPAN & FOLLOW'],
      relationship: ['SERING DIABAIKAN', 'AKAR MASALAHNYA DI SINI', 'HUBUNGAN JADI BEDA', 'INTINYA SEPERTI INI', 'SHARE KE PASANGANMU'],
      facts: ['FAKTA MENGEJUTKAN', 'INI ALASANNYA', 'DAMPAKNYA LEBIH BESAR', 'JADI KESIMPULANNYA', 'FOLLOW UNTUK FAKTA LAINNYA']
    };
    const captions = captionSets[mode];

    const narrationSegments = [hook, build, climax, resolution, cta];
    const visuals = [
      'Visual hook dramatis, close-up dengan pencahayaan sinematik',
      'Montase adegan pendukung yang membangun rasa penasaran',
      'Momen puncak dengan efek visual dramatis dan tempo lebih cepat',
      'Visual penutup yang lebih tenang, memberi kesan kesimpulan/penyelesaian',
      'Ajakan follow/subscribe dengan visual cerah dan energik'
    ];

    const scenes = narrationSegments.map((seg, idx) => ({
      sceneNumber: idx + 1,
      timeRange: `Scene ${idx + 1}`,
      visualDescription: visuals[idx],
      captionText: captions[idx],
      narrationSegment: seg
    }));

    const cleanNicheTag = (niche || 'shorts').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
    return {
      title: `${t.slice(0, 45)} 👀 #shorts`,
      description: `${hook}\n\n${build}\n\n#shorts #viral #trending #${cleanNicheTag}`,
      tags: `shorts, viral, trending, ${(niche || '').toLowerCase()}, ${t.toLowerCase()}, cerita, fakta, hiburan, youtube shorts, fyp`,
      narration: narrationSegments.join(' '),
      durationSeconds: 32,
      scenes,
      generatedBy: `Smart Generator Lokal (AI utama tidak terjangkau${reason ? `: ${reason}` : ''})`,
      generatedAt: new Date().toISOString()
    };
  }
}

export default new AIService();
