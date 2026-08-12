import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ttsService from './ttsService.js';
import aiVideoService from './aiVideoService.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const W = 720, H = 1280;

class VideoRendererService {
  constructor() {
    this.videosDir = path.join(__dirname, '../../public/videos');
    if (!fs.existsSync(this.videosDir)) fs.mkdirSync(this.videosDir, { recursive: true });

    this.bgThemes = [
      { id: 'cyberpunk', name: 'Neon Cyberpunk AI', color1: '0x0d1124', accent: '#00f2fe', badge: 'Futuristik', query: 'cyberpunk,neon,tech,city,futuristic' },
      { id: 'tech_dark', name: 'Deep Obsidian Tech', color1: '0x090e1a', accent: '#a855f7', badge: 'Teknologi', query: 'technology,abstract,code,server,digital' },
      { id: 'luxury_gold', name: 'Luxury Dark Gold', color1: '0x14120e', accent: '#f59e0b', badge: 'Premium', query: 'luxury,abstract,geometric,dark,premium' },
      { id: 'gaming_emerald', name: 'Cyber Emerald Matrix', color1: '0x041411', accent: '#10b981', badge: 'Viral TikTok', query: 'matrix,green,code,gaming,digital,hacker' }
    ];
  }

  getAvailableThemes() { return this.bgThemes; }

  sanitizeText(str = '', maxLen = 55) {
    return (str || '')
      // Buang emoji: font Poppins Bold yang dipakai untuk overlay video tidak punya glyph
      // emoji berwarna, jadi kalau dibiarkan akan muncul kotak/tofu yang jelek di video.
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
      .replace(/['":;\\]/g, '')
      .replace(/\n/g, ' ')
      .trim()
      .slice(0, maxLen);
  }

  getCaption(scene) { return scene?.captionText || scene?.caption || ''; }
  getNarration(scene) { return scene?.narrationSegment || scene?.narration || ''; }

  /**
   * Bungkus teks jadi beberapa baris (seperti subtitle) supaya SELALU muat di lebar canvas
   * 720px, bukan satu baris panjang yang kepotong/keluar layar seperti sebelumnya. Lebar
   * karakter diperkirakan dari fontsize (estimasi kasar untuk Poppins Bold), dibatasi maksimal
   * `maxLines` baris — kalau masih kepanjangan, baris terakhir dipotong dengan elipsis "…".
   */
  wrapText(text, fontsize, maxLines = 3) {
    const clean = (text || '').trim();
    if (!clean) return '';
    const avgCharWidth = fontsize * 0.56;
    const maxChars = Math.max(6, Math.floor((W - 80) / avgCharWidth));
    const words = clean.split(/\s+/).filter(Boolean);

    const lines = [];
    let current = '';
    let idx = 0;
    while (idx < words.length) {
      const w = words[idx];
      const test = current ? `${current} ${w}` : w;
      if (test.length > maxChars && current) {
        lines.push(current);
        current = '';
        if (lines.length >= maxLines) break;
      } else {
        current = test;
        idx++;
      }
    }
    const consumedAll = idx >= words.length;
    if (current && lines.length < maxLines) {
      lines.push(current);
    }

    if (!consumedAll) {
      let last = lines[lines.length - 1] || '';
      if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1).trimEnd();
      lines[lines.length - 1] = last.replace(/[.,!?]+$/, '') + '…';
    }
    return lines.join('\n');
  }

  /**
   * Bangun satu filter drawtext dengan animasi fade-in/out + sedikit slide-up, supaya teks
   * tidak muncul/hilang secara kaku (potong langsung) seperti sebelumnya. `withBox` menambah
   * pill/box semi-transparan di belakang teks (dipakai untuk caption utama, bukan subtitle).
   */
  buildAnimatedDrawtext({ fontfile, text, color, fontsize, y, t0, t1, withBox = false }) {
    const dur = Math.max(t1 - t0, 0.3);
    const fade = Math.min(0.25, dur / 3);
    const fadeS = fade.toFixed(2);
    const t0s = t0.toFixed(2);
    const t1s = t1.toFixed(2);
    const fadeInEnd = (t0 + fade).toFixed(2);
    const fadeOutStart = (t1 - fade).toFixed(2);
    const alphaExpr = `if(lt(t\\,${fadeInEnd})\\,(t-${t0s})/${fadeS}\\,if(lt(t\\,${fadeOutStart})\\,1\\,(${t1s}-t)/${fadeS}))`;
    const yExpr = `${y}+16*(1-min((t-${t0s})/${fadeS}\\,1))`;
    const boxPart = withBox ? ':box=1:boxcolor=black@0.35:boxborderw=14' : '';
    return `drawtext=fontfile='${fontfile}':text='${text}':fontcolor=${color}:fontsize=${fontsize}:x=(w-text_w)/2:y='${yExpr}':alpha='${alphaExpr}'${boxPart}:enable='between(t\\,${t0s}\\,${t1s})'`;
  }

  /**
   * Download SATU gambar background dengan seed unik dari Picsum Photos (foto stok acak,
   * gratis, tidak butuh API key). Catatan: Unsplash Source API (source.unsplash.com) sudah
   * dimatikan oleh Unsplash sejak 2023, jadi kita pakai Picsum sebagai gantinya.
   */
  async downloadBg(themeId, uniqueSuffix) {
    const seed = `${themeId}_${uniqueSuffix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const localPath = path.join(this.videosDir, `bg_${seed}.jpg`);
    try {
      await execFileAsync('curl', ['-s', '-o', localPath, '--max-time', '6', '-L',
        `https://picsum.photos/seed/${encodeURIComponent(seed)}/${W}/${H}`]);
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 8000) return localPath;
    } catch {}
    return null;
  }

  /** Susun prompt gambar AI singkat dari deskripsi scene, judul, dan tema visual */
  buildImagePrompt(scene, title, theme) {
    const desc = (scene?.visualDescription || scene?.captionText || scene?.narrationSegment || title || '').toString().slice(0, 200);
    return `${desc}, ${theme.name} aesthetic, cinematic vertical photo, high detail, no text, no watermark, no logo`;
  }

  /**
   * Download/generate SATU gambar background per scene, supaya visual video berganti-ganti
   * mengikuti alur cerita/narasi (bukan satu gambar statis diam sepanjang video). Kalau AI
   * background image diaktifkan (fal.ai FLUX schnell, opt-in & berbayar kecil ~$0.003/gambar),
   * dicoba dulu supaya gambarnya BENAR-BENAR sesuai tema/topik — kalau gagal (quota habis, API
   * key salah, dll), otomatis jatuh ke foto stok Picsum seperti biasa (bukan gagal total).
   */
  async downloadBgs(themeId, count, { scenes = [], title = '', theme } = {}) {
    const paths = [];
    const useAi = aiVideoService.isBackgroundImageEnabled;
    for (let i = 0; i < count; i++) {
      let p = null;
      if (useAi) {
        try {
          const prompt = this.buildImagePrompt(scenes[i], title, theme);
          p = await aiVideoService.generateBackgroundImage(prompt);
        } catch (err) {
          console.warn(`[VideoRenderer] Gagal generate background AI scene ${i + 1}, pakai Picsum:`, err.message);
        }
      }
      if (!p) p = await this.downloadBg(themeId, i);
      paths.push(p);
    }
    return paths;
  }

  async renderVerticalShort({ title = '', narration = '', scenes = [], themeId = 'cyberpunk', durationSeconds = 8 }) {
    const theme = this.bgThemes.find(t => t.id === themeId) || this.bgThemes[0];
    const filename = `short_${Date.now()}.mp4`;
    const outputPath = path.join(this.videosDir, filename);
    const fontPath = 'public/assets/render/poppins-bold.ttf';
    const cleanTitle = this.sanitizeText(title || 'AI SHORTS STUDIO');

    // Coba sintesis narator suara asli (edge-tts, gratis) dari naskah narasi. Kalau berhasil,
    // durasi video disesuaikan mengikuti panjang audio narasi sungguhan (bukan angka default).
    // Kalau gagal/nonaktif, tetap render dengan placeholder ambient seperti sebelumnya.
    let narrationAudioPath = null;
    if (narration && narration.trim() && ttsService.enabled) {
      try {
        const speech = await ttsService.synthesize(narration);
        if (speech.durationSeconds > 0) {
          narrationAudioPath = speech.filePath;
          // Batas atas dinaikkan dari 90s ke 380s supaya konten cerita/dongeng (3-6 menit)
          // tidak diam-diam terpotong pendek — hanya jadi pengaman kalau TTS/AI mengembalikan
          // durasi yang tidak masuk akal.
          durationSeconds = Math.min(Math.max(speech.durationSeconds, 4), 380);
        }
      } catch (err) {
        console.warn('[VideoRenderer] TTS gagal, pakai audio placeholder:', err.message);
      }
    }

    const sc = scenes && scenes.length > 0 ? scenes : [];
    // Batas atas dinaikkan dari 6 ke 30 scene supaya video panjang (cerita/dongeng) tetap dapat
    // background/visual yang berganti mengikuti alur, bukan cuma 6 gambar diulang-ulang.
    const sceneCount = Math.max(Math.min(sc.length, 30), 1);
    const segDur = durationSeconds / sceneCount;
    const fadeOutStart = Math.max(durationSeconds - 1, 0);

    // Download/generate SATU gambar background per scene (bukan satu gambar untuk seluruh video)
    const bgPaths = await this.downloadBgs(themeId, sceneCount, { scenes: sc, title, theme });

    // Filter drawtext (judul di awal, caption+narasi per scene dengan animasi fade+slide, watermark permanen).
    // Font pakai Poppins Bold (dibundel di public/videos/poppins-bold.ttf) yang lebih tebal & modern
    // untuk gaya shorts/reels, ganti dari Arial polos sebelumnya.
    const CAPTION_FONTSIZE = 42;
    const NARRATION_FONTSIZE = 27;
    const CAPTION_LINE_HEIGHT = CAPTION_FONTSIZE * 1.3;
    const NARRATION_LINE_HEIGHT = NARRATION_FONTSIZE * 1.3;
    const CAPTION_TOP_Y = 400;
    const WATERMARK_Y = 1190;

    const draws = [];
    const wrappedTitle = this.wrapText(cleanTitle, 38, 2);
    draws.push(this.buildAnimatedDrawtext({
      fontfile: fontPath, text: wrappedTitle, color: 'white', fontsize: 38, y: 130,
      t0: 0, t1: Math.min(3, durationSeconds), withBox: true
    }));

    for (let i = 0; i < sceneCount; i++) {
      // sanitizeText tidak lagi memotong paksa di 55 karakter — wrapText di bawah yang
      // membungkus teks jadi beberapa baris seperti subtitle, menyesuaikan lebar canvas 720px,
      // supaya teks TIDAK kepotong/keluar layar seperti sebelumnya.
      const capRaw = this.sanitizeText(this.getCaption(sc[i]), 90);
      const narRaw = this.sanitizeText(this.getNarration(sc[i]), 170);
      const t0 = i * segDur;
      const t1 = Math.min((i + 1) * segDur, durationSeconds);

      let capLineCount = 0;
      if (capRaw) {
        const wrappedCap = this.wrapText(capRaw, CAPTION_FONTSIZE, 2);
        capLineCount = wrappedCap.split('\n').length;
        draws.push(this.buildAnimatedDrawtext({
          fontfile: fontPath, text: wrappedCap, color: theme.accent, fontsize: CAPTION_FONTSIZE, y: CAPTION_TOP_Y,
          t0, t1, withBox: true
        }));
      }

      if (narRaw) {
        // Posisi narasi mengikuti tinggi caption di atasnya (dinamis), bukan angka Y tetap,
        // supaya caption 2 baris tidak menabrak/menumpuk narasi di bawahnya.
        const narY = Math.min(
          CAPTION_TOP_Y + capLineCount * CAPTION_LINE_HEIGHT + 34,
          WATERMARK_Y - NARRATION_LINE_HEIGHT * 3 - 30
        );
        const wrappedNar = this.wrapText(narRaw, NARRATION_FONTSIZE, 3);
        draws.push(this.buildAnimatedDrawtext({
          fontfile: fontPath, text: wrappedNar, color: 'white', fontsize: NARRATION_FONTSIZE, y: narY,
          t0: Math.max(t0, 0.2), t1, withBox: false
        }));
      }
    }
    draws.push(`drawtext=fontfile='${fontPath}':text='@AIShortsStudio | #shorts':fontcolor=0xa855f7:fontsize=26:x=(w-text_w)/2:y=${WATERMARK_Y}`);
    const vfStr = draws.join(',');

    // --- Susun input video: satu input per scene (gambar di-loop / warna solid fallback) ---
    const videoInputArgs = [];
    const segFilters = [];
    let inputIdx = 0;
    // Kanvas gambar di-scale sedikit lebih besar dari ukuran akhir supaya ada "ruang" buat
    // efek zoom (Ken Burns) — bergantian zoom-in/zoom-out per scene supaya background terasa
    // hidup/bergerak, bukan foto diam kaku seperti sebelumnya.
    const OVERSCALE = 1.28;
    const ZW = Math.round(W * OVERSCALE / 2) * 2;
    const ZH = Math.round(H * OVERSCALE / 2) * 2;
    const ZOOM_RANGE = 0.15;

    for (let i = 0; i < sceneCount; i++) {
      const isLast = i === sceneCount - 1;
      const dur = (isLast ? durationSeconds - segDur * (sceneCount - 1) : segDur);
      const d = Math.max(dur, 0.4).toFixed(2);
      const bp = bgPaths[i];
      if (bp && fs.existsSync(bp)) {
        videoInputArgs.push('-loop', '1', '-t', d, '-i', bp.replace(/\\/g, '/'));
      } else {
        videoInputArgs.push('-f', 'lavfi', '-t', d, '-i', `color=c=${theme.color1}:s=${W}x${H}:r=30`);
      }
      const frames = Math.max(Math.round(parseFloat(d) * 30), 2);
      const rate = ZOOM_RANGE / frames;
      const zoomIn = i % 2 === 0;
      const zExpr = zoomIn
        ? `min(1.0+${rate.toFixed(7)}*on,${(1 + ZOOM_RANGE).toFixed(3)})`
        : `max(${(1 + ZOOM_RANGE).toFixed(3)}-${rate.toFixed(7)}*on,1.0)`;
      segFilters.push(
        `[${inputIdx}:v]scale=${ZW}:${ZH}:force_original_aspect_ratio=increase,crop=${ZW}:${ZH},` +
        `zoompan=z='${zExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,setsar=1,format=yuv420p[v${i}]`
      );
      inputIdx++;
    }
    const concatInputs = Array.from({ length: sceneCount }, (_, i) => `[v${i}]`).join('');
    const concatFilter = sceneCount > 1
      ? `${concatInputs}concat=n=${sceneCount}:v=1:a=0[vraw]`
      : `[v0]copy[vraw]`;

    // Gradient overlay (asset statis dibundel di public/assets/render/text-gradient.png): gelap secara
    // BERTAHAP hanya di area sekitar teks, bukan kotak hitam solid menutup separuh layar seperti
    // sebelumnya — jadi background tetap kelihatan sampai ke bawah, tidak terasa "kosong".
    const gradientIdx = inputIdx;
    const gradientInputArgs = ['-loop', '1', '-t', String(durationSeconds), '-i', 'public/assets/render/text-gradient.png'];
    inputIdx++;
    const gradientFilter = `[vraw][${gradientIdx}:v]overlay=0:0:format=auto[vgrad]`;
    const drawFilter = `[vgrad]${vfStr}[vout]`;

    // --- Susun input audio: narasi (TTS asli / placeholder ambient) + audio bed musik latar ---
    // Musik latar disintesis (dua nada rendah dipadukan & di-lowpass supaya terdengar seperti pad
    // musik lembut, bukan file berlisensi eksternal) dan dicampur (amix) di volume kecil di bawah
    // narasi, supaya video terasa "jadi" dan tidak sunyi/hanya narasi polos.
    const narrIdx = inputIdx;
    const narrInputArgs = narrationAudioPath
      ? ['-i', narrationAudioPath]
      : ['-f', 'lavfi', '-t', String(durationSeconds), '-i', `sine=frequency=180:duration=${durationSeconds}`];
    inputIdx++;

    const musicIdxA = inputIdx;
    const musicInputArgsA = ['-f', 'lavfi', '-t', String(durationSeconds), '-i', `sine=frequency=110:duration=${durationSeconds}`];
    inputIdx++;
    const musicIdxB = inputIdx;
    const musicInputArgsB = ['-f', 'lavfi', '-t', String(durationSeconds), '-i', `sine=frequency=164.81:duration=${durationSeconds}`];
    inputIdx++;

    const narrFilter = narrationAudioPath
      ? `[${narrIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:st=0:d=0.3,afade=t=out:st=${fadeOutStart}:d=0.5[narr]`
      : `[${narrIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.15,tremolo=f=3:d=0.3[narr]`;
    const musicFilter =
      `[${musicIdxA}:a]aformat=sample_rates=44100:channel_layouts=stereo[m1];` +
      `[${musicIdxB}:a]aformat=sample_rates=44100:channel_layouts=stereo[m2];` +
      `[m1][m2]amix=inputs=2:duration=first[padraw];` +
      `[padraw]volume=0.055,lowpass=f=900,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=1.2[pad]`;
    const mixFilter = `[narr][pad]amix=inputs=2:duration=first:dropout_transition=2,volume=1.6[aout]`;

    const filterComplex = [...segFilters, concatFilter, gradientFilter, drawFilter, narrFilter, musicFilter, mixFilter].join(';');

    const args = [
      '-y',
      ...videoInputArgs,
      ...gradientInputArgs,
      ...narrInputArgs,
      ...musicInputArgsA,
      ...musicInputArgsB,
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', '[aout]',
      '-t', String(durationSeconds),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      outputPath
    ];

    try {
      await execFileAsync('ffmpeg', args);
    } catch (err) {
      console.error('[VideoRenderer] FFmpeg error:', err.message);
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-f', 'lavfi', '-i', `color=c=${theme.color1}:s=${W}x${H}:d=4:r=30`,
          '-f', 'lavfi', '-i', 'sine=frequency=180:duration=4',
          '-af', 'volume=0.15,afade=t=in:st=0:d=1,afade=t=out:st=3:d=1',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', outputPath
        ]);
      } catch {}
    }

    for (const bp of bgPaths) { if (bp && fs.existsSync(bp)) { try { fs.unlinkSync(bp); } catch {} } }
    if (narrationAudioPath && fs.existsSync(narrationAudioPath)) { try { fs.unlinkSync(narrationAudioPath); } catch {} }

    const formattedScenes = (scenes || []).map((scene, idx) => ({ ...scene, startTime: idx * 2, endTime: (idx + 1) * 2 }));

    return {
      id: 'short_' + Date.now(),
      aspectRatio: '9:16', resolution: `${W}x${H}`, durationSeconds,
      theme: { id: theme.id, name: theme.name, colorHex: theme.color1, accentColor: theme.accent, badge: theme.badge },
      scenes: formattedScenes,
      renderStatus: 'COMPLETED',
      hasVoiceover: Boolean(narrationAudioPath),
      videoFilename: filename, videoUrl: `/videos/${filename}`, downloadUrl: `/videos/${filename}`,
      createdTimestamp: new Date().toISOString()
    };
  }
}

export default new VideoRendererService();
