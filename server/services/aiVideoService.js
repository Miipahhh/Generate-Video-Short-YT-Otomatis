import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';
import ttsService from './ttsService.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_DURATIONS = [5, 10, 15]; // Batasan durasi model Wan 2.6 T2V
const PROMPT_MAX_CHARS = 800;

class AIVideoService {
  constructor() {
    const saved = dbService.getVideoConfig() || {};
    this.provider = saved.provider || 'template';
    this.apiKey = saved.falApiKey || '';
    this.model = saved.falModel || 'wan/v2.6/text-to-video';
    this.resolution = saved.resolution || '720p';
    this.aiBackgroundImages = saved.aiBackgroundImages || false;
    this.videosDir = path.join(__dirname, '../../public/videos');
    if (!fs.existsSync(this.videosDir)) fs.mkdirSync(this.videosDir, { recursive: true });
  }

  updateConfig({ provider, falApiKey, falModel, resolution, aiBackgroundImages }) {
    if (provider) this.provider = provider;
    if (falApiKey !== undefined) this.apiKey = falApiKey;
    if (falModel) this.model = falModel;
    if (resolution) this.resolution = resolution;
    if (aiBackgroundImages !== undefined) this.aiBackgroundImages = aiBackgroundImages;
    dbService.saveVideoConfig({
      provider: this.provider,
      falApiKey: this.apiKey,
      falModel: this.model,
      resolution: this.resolution,
      aiBackgroundImages: this.aiBackgroundImages
    });
  }

  getConfig() {
    return {
      provider: this.provider,
      hasApiKey: Boolean(this.apiKey && this.apiKey.length > 5),
      falModel: this.model,
      resolution: this.resolution,
      aiBackgroundImages: this.aiBackgroundImages
    };
  }

  get isEnabled() {
    return this.provider === 'fal_ai' && Boolean(this.apiKey);
  }

  /** Background gambar AI aktif kalau ada API key fal.ai terisi DAN toggle-nya dinyalakan
   * di Pengaturan — terpisah dari mode "AI Video penuh", supaya user bisa pakai template
   * FFmpeg (murah/gratis) tapi backgroundnya tetap gambar AI sesuai tema (jauh lebih murah
   * daripada generate video AI penuh). */
  get isBackgroundImageEnabled() {
    return Boolean(this.apiKey && this.apiKey.length > 5) && this.aiBackgroundImages;
  }

  /**
   * Generate SATU gambar background AI (fal.ai FLUX schnell, model gambar cepat & murah,
   * ~$0.003/gambar) sesuai deskripsi scene, supaya visual video benar-benar sesuai tema/topik —
   * bukan foto stok acak. Sync endpoint (fal.run) dipakai karena FLUX schnell biasanya selesai
   * dalam 1-3 detik, jadi tidak perlu polling seperti mode video.
   */
  async generateBackgroundImage(prompt) {
    if (!this.apiKey) throw new Error('Fal.ai API Key belum diatur.');
    const cleanPrompt = (prompt || 'abstract cinematic background').slice(0, 400);

    let res;
    try {
      res = await axios.post(
        'https://fal.run/fal-ai/flux/schnell',
        {
          prompt: cleanPrompt,
          image_size: 'portrait_16_9',
          num_images: 1,
          num_inference_steps: 4,
          enable_safety_checker: true
        },
        { headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
      );
    } catch (err) {
      throw new Error(`Generate gambar AI gagal (HTTP ${err.response?.status || '?'}): ${this.describeAxiosError(err)}`);
    }

    const imageUrl = res.data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error(`Fal.ai tidak mengembalikan URL gambar. Respons: ${JSON.stringify(res.data).slice(0, 200)}`);
    }

    const localPath = path.join(this.videosDir, `aibg_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`);
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    fs.writeFileSync(localPath, imgRes.data);
    return localPath;
  }

  snapDuration(requested) {
    let closest = ALLOWED_DURATIONS[0];
    for (const d of ALLOWED_DURATIONS) {
      if (Math.abs(d - requested) < Math.abs(closest - requested)) closest = d;
    }
    return closest;
  }

  /** Susun prompt multi-shot dari scene AI supaya visual video sesuai topik & naskah */
  buildPrompt({ title, scenes, targetDuration }) {
    const sceneList = scenes && scenes.length
      ? scenes
      : [{ visualDescription: title, narrationSegment: title }];
    const perShot = targetDuration / sceneList.length;

    const intro = `Vertical 9:16 cinematic short video about: "${title}". Photoreal, dynamic camera movement, cinematic lighting. No subtitles, no on-screen text, no UI, no watermark.`;
    const shotLines = [];
    let cursor = 0;
    sceneList.forEach((scene, idx) => {
      const t0 = Math.round(cursor);
      const t1 = Math.round(Math.min(cursor + perShot, targetDuration));
      const desc = (scene.visualDescription || scene.captionText || scene.narrationSegment || title || '')
        .toString()
        .slice(0, 140);
      shotLines.push(`Shot ${idx + 1} [${t0}-${t1}s]: ${desc}`);
      cursor += perShot;
    });

    let prompt = `${intro}\n${shotLines.join('\n')}`;
    if (prompt.length > PROMPT_MAX_CHARS) prompt = prompt.slice(0, PROMPT_MAX_CHARS);
    return prompt;
  }

  /** Submit ke fal.ai queue API, poll sampai selesai, lalu unduh video hasilnya */
  async generateVideo({ title, narration, scenes, durationSeconds }) {
    if (!this.apiKey) {
      throw new Error('Fal.ai API Key belum diatur. Isi dulu di tab Pengaturan.');
    }

    const targetDuration = this.snapDuration(durationSeconds || 10);
    const prompt = this.buildPrompt({ title, scenes, targetDuration });
    const authHeaders = { Authorization: `Key ${this.apiKey}` };

    let submitRes;
    try {
      submitRes = await axios.post(
        `https://queue.fal.run/${this.model}`,
        {
          prompt,
          aspect_ratio: '9:16',
          resolution: this.resolution,
          duration: String(targetDuration),
          enable_prompt_expansion: true,
          multi_shots: true
        },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
    } catch (err) {
      throw new Error(`Submit ke fal.ai gagal (HTTP ${err.response?.status || '?'}): ${this.describeAxiosError(err)}`);
    }

    const { status_url: statusUrl, response_url: responseUrl } = submitRes.data || {};
    if (!statusUrl || !responseUrl) {
      throw new Error(`Fal.ai tidak mengembalikan status_url/response_url. Respons: ${JSON.stringify(submitRes.data).slice(0, 300)}`);
    }

    // Poll status sampai COMPLETED (video generation biasanya 30 detik - 3 menit).
    // PENTING: menurut dokumentasi fal.ai, request yang GAGAL tetap bisa berstatus
    // "COMPLETED" tapi dengan field `error` terisi (bukan status terpisah semacam FAILED),
    // jadi kita wajib cek field itu, bukan cuma percaya status === COMPLETED.
    const maxWaitMs = 5 * 60 * 1000;
    const pollIntervalMs = 4000;
    const startedAt = Date.now();
    let lastStatusData = null;

    while (Date.now() - startedAt < maxWaitMs) {
      let statusRes;
      try {
        statusRes = await axios.get(statusUrl, { headers: authHeaders, timeout: 15000 });
      } catch (err) {
        throw new Error(`Cek status fal.ai gagal (HTTP ${err.response?.status || '?'}): ${this.describeAxiosError(err)}`);
      }
      lastStatusData = statusRes.data;
      if (lastStatusData?.error) {
        throw new Error(`Fal.ai gagal generate (${lastStatusData.error_type || 'error'}): ${lastStatusData.error}`);
      }
      if (lastStatusData?.status === 'COMPLETED') break;
      if (lastStatusData?.status === 'ERROR' || lastStatusData?.status === 'FAILED') {
        throw new Error(`Fal.ai gagal generate video: ${JSON.stringify(lastStatusData).slice(0, 300)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    if (lastStatusData?.status !== 'COMPLETED') {
      throw new Error(`Fal.ai timeout menunggu hasil video (status terakhir: ${lastStatusData?.status || 'tidak diketahui'})`);
    }

    let resultRes;
    try {
      resultRes = await axios.get(responseUrl, { headers: authHeaders, timeout: 15000 });
    } catch (err) {
      throw new Error(`Ambil hasil fal.ai gagal (HTTP ${err.response?.status || '?'}): ${this.describeAxiosError(err)}`);
    }
    const videoUrl = resultRes.data?.video?.url;
    if (!videoUrl) {
      throw new Error(`Fal.ai tidak mengembalikan URL video. Respons: ${JSON.stringify(resultRes.data).slice(0, 300)}`);
    }

    // Unduh video hasil generate AI ke folder lokal
    const rawFilename = `ai_raw_${Date.now()}.mp4`;
    const rawPath = path.join(this.videosDir, rawFilename);
    const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(rawPath, videoRes.data);

    // Sintesis narator suara asli (edge-tts, gratis) dari naskah narasi, buat menggantikan
    // audio bawaan model AI video (Wan tidak membacakan naskah kita — audionya cuma ambient/
    // efek suara acak sesuai prompt, kalau ada sama sekali).
    let narrationAudioPath = null;
    if (narration && narration.trim() && ttsService.enabled) {
      try {
        const speech = await ttsService.synthesize(narration);
        if (speech.durationSeconds > 0) narrationAudioPath = speech.filePath;
      } catch (err) {
        console.warn('[AIVideoService] TTS gagal, video AI dipakai dengan audio bawaan:', err.message);
      }
    }

    // Tempelkan judul + watermark ringan di atas video AI, dan ganti audionya dengan narasi TTS kalau ada
    const finalFilename = `ai_${Date.now()}.mp4`;
    const finalPath = path.join(this.videosDir, finalFilename);
    const brandingOk = await this.overlayBranding(rawPath, finalPath, { title, durationSeconds: targetDuration, narrationAudioPath });
    const outputFilename = brandingOk ? finalFilename : rawFilename;
    if (brandingOk && fs.existsSync(rawPath)) {
      try { fs.unlinkSync(rawPath); } catch { /* noop */ }
    }
    if (narrationAudioPath && fs.existsSync(narrationAudioPath)) {
      try { fs.unlinkSync(narrationAudioPath); } catch { /* noop */ }
    }

    return {
      id: 'ai_' + Date.now(),
      aspectRatio: '9:16',
      resolution: this.resolution === '1080p' ? '1080x1920' : '720x1280',
      durationSeconds: targetDuration,
      provider: 'fal.ai',
      model: this.model,
      prompt,
      hasVoiceover: Boolean(narrationAudioPath),
      scenes: (scenes || []).map((scene, idx) => ({ ...scene, startTime: idx * 2, endTime: (idx + 1) * 2 })),
      renderStatus: 'COMPLETED',
      videoFilename: outputFilename,
      videoUrl: `/videos/${outputFilename}`,
      downloadUrl: `/videos/${outputFilename}`,
      createdTimestamp: new Date().toISOString()
    };
  }

  /** Ekstrak pesan error yang berguna dari axios error (body API kalau ada, bukan cuma "status code X") */
  describeAxiosError(err) {
    const data = err.response?.data;
    if (data) {
      if (typeof data === 'string') return data.slice(0, 300);
      return JSON.stringify(data).slice(0, 300);
    }
    return err.message;
  }

  sanitizeText(str = '') {
    return (str || '').replace(/['":;\\]/g, '').replace(/\n/g, ' ').trim().slice(0, 55);
  }

  /**
   * Tempel judul (0-3 detik) + watermark permanen di atas video hasil AI.
   * Kalau ada narrationAudioPath (hasil TTS), audio bawaan video AI diganti dengan narasi itu
   * (dipotong pas sesuai durasi video, dengan fade-out halus di akhir). Kalau tidak ada,
   * audio asli dari video AI tetap dipakai apa adanya. Gagal total = pakai video mentah.
   */
  async overlayBranding(inputPath, outputPath, { title, durationSeconds, narrationAudioPath }) {
    const fontPath = 'public/assets/render/poppins-bold.ttf';
    const cleanTitle = this.sanitizeText(title || 'AI SHORTS STUDIO');
    const draws = [
      `drawtext=fontfile='${fontPath}':text='${cleanTitle}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=120:box=1:boxcolor=black@0.4:boxborderw=14:enable='between(t,0,${Math.min(3, durationSeconds)})'`,
      `drawtext=fontfile='${fontPath}':text='@AIShortsStudio | #shorts':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=1190:box=1:boxcolor=black@0.4:boxborderw=10`
    ];

    const fadeOutStart = Math.max(durationSeconds - 0.5, 0);
    const args = narrationAudioPath
      ? [
          '-y', '-i', inputPath, '-i', narrationAudioPath,
          '-vf', draws.join(','),
          '-map', '0:v', '-map', '1:a',
          '-af', `afade=t=out:st=${fadeOutStart}:d=0.5`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k',
          '-t', String(durationSeconds),
          '-shortest',
          outputPath
        ]
      : [
          '-y', '-i', inputPath,
          '-vf', draws.join(','),
          '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-c:a', 'copy',
          outputPath
        ];

    try {
      await execFileAsync('ffmpeg', args);
      return fs.existsSync(outputPath);
    } catch (err) {
      console.warn('[AIVideoService] Gagal overlay branding, pakai video AI mentah:', err.message);
      return false;
    }
  }
}

export default new AIVideoService();
