/**
 * Util murni buat menyusun filter drawtext ffmpeg (bersihkan teks, bungkus jadi beberapa
 * baris, animasi fade-in/out + slide) — dipakai bareng oleh videoRendererService (template
 * FFmpeg) dan aiVideoService (fal.ai), supaya caption di kedua mode konsisten. Sebelumnya
 * logic ini cuma ada di videoRendererService, jadi video fal.ai sama sekali tanpa teks di
 * layar sepanjang video (cuma judul 3 detik awal + watermark).
 */

export function sanitizeText(str = '', maxLen = 55) {
  return (str || '')
    // Buang emoji: font Poppins Bold yang dipakai untuk overlay video tidak punya glyph
    // emoji berwarna, jadi kalau dibiarkan akan muncul kotak/tofu yang jelek di video.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/['":;\\]/g, '')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function getCaption(scene) { return scene?.captionText || scene?.caption || ''; }
export function getNarration(scene) { return scene?.narrationSegment || scene?.narration || ''; }

/**
 * Bungkus teks jadi beberapa baris (seperti subtitle) supaya SELALU muat di lebar canvas
 * `canvasWidth`, bukan satu baris panjang yang kepotong/keluar layar. Lebar karakter
 * diperkirakan dari fontsize (estimasi kasar untuk Poppins Bold), dibatasi maksimal
 * `maxLines` baris — kalau masih kepanjangan, baris terakhir dipotong dengan elipsis "…".
 */
export function wrapText(text, fontsize, canvasWidth, maxLines = 3) {
  const clean = (text || '').trim();
  if (!clean) return '';
  const avgCharWidth = fontsize * 0.56;
  const maxChars = Math.max(6, Math.floor((canvasWidth - 80) / avgCharWidth));
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
 * tidak muncul/hilang secara kaku (potong langsung). `withBox` menambah pill/box
 * semi-transparan di belakang teks (dipakai untuk caption utama, bukan subtitle/narasi).
 */
export function buildAnimatedDrawtext({ fontfile, text, color, fontsize, y, t0, t1, withBox = false }) {
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
