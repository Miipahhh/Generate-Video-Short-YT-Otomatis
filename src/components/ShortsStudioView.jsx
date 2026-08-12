import React, { useState, useEffect } from 'react';
import { Copy, Dices, Download } from 'lucide-react';
import axios from 'axios';
import { toast } from '../lib/toast.js';
import { useProgress } from '../lib/useProgress.js';
import ProgressBar from './ui/ProgressBar.jsx';

// Perkiraan lama proses (detik) untuk mengatur laju bar. Angkanya sengaja beda per sumber
// video karena bedanya jauh: template FFmpeg hitungan detik, MoneyPrinterTurbo bisa
// belasan menit. Khusus MoneyPrinterTurbo, bar nanti dioper ke progres asli dari servernya.
const RENDER_PACE = {
  template: 25,
  fal_ai: 70,
  moneyprinter: 240
};

// Bank topik lintas genre — dipakai sebagai topik awal dan cadangan tombol "Ide acak"
// kalau AI tidak terjangkau.
const TOPIC_BANK = [
  { topic: 'Fakta AI yang bakal ganti pekerjaan manusia', niche: 'Teknologi & AI', tone: 'Energik & viral' },
  { topic: 'Misteri rumah kosong yang tak pernah terpecahkan', niche: 'Misteri & horor', tone: 'Misterius' },
  { topic: 'Cerita singkat: surat dari masa depan', niche: 'Cerita fiksi pendek', tone: 'Misterius' },
  { topic: 'Kenapa orang susah mengaku salah', niche: 'Psikologi & fakta sosial', tone: 'Santai' },
  { topic: 'Fakta sejarah yang sengaja ditutupi', niche: 'Sejarah tersembunyi', tone: 'Misterius' },
  { topic: 'Kesalahan keuangan yang bikin orang tetap miskin', niche: 'Keuangan & investasi', tone: 'Energik & viral' },
  { topic: 'Kebiasaan kecil yang diam-diam merusak kesehatan', niche: 'Kesehatan & sains', tone: 'Santai' },
  { topic: 'Hewan dengan kemampuan bertahan hidup paling gila', niche: 'Hewan & alam liar', tone: 'Energik & viral' },
  { topic: 'Teori konspirasi yang ternyata ada benarnya', niche: 'Konspirasi & urban legend', tone: 'Dramatis' },
  { topic: 'Kebiasaan orang sukses sebelum jam 8 pagi', niche: 'Motivasi & karir', tone: 'Energik & viral' }
];

const NICHES = [...new Set(TOPIC_BANK.map((t) => t.niche))];
const TONES = ['Energik & viral', 'Misterius', 'Santai', 'Dramatis'];
const THEMES = [
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'tech_dark', label: 'Tech gelap' },
  { id: 'luxury_gold', label: 'Luxury gold' },
  { id: 'gaming_emerald', label: 'Emerald' }
];

const randomPick = () => TOPIC_BANK[Math.floor(Math.random() * TOPIC_BANK.length)];

export default function ShortsStudioView({ onShortCreated }) {
  const [initial] = useState(randomPick);
  const [topic, setTopic] = useState(initial.topic);
  const [niche, setNiche] = useState(initial.niche);
  const [tone, setTone] = useState(initial.tone);
  const [themeId, setThemeId] = useState('cyberpunk');
  // Default sengaja "none" alias render saja: mengunggah ke channel YouTube asli itu langkah
  // yang tidak bisa ditarik balik, jadi harus dipilih sadar, bukan kejadian karena lupa ganti.
  const [privacyStatus, setPrivacyStatus] = useState('none');
  // Tema visual cuma dipakai renderer template FFmpeg (warna caption + gaya gambar AI).
  // Di mode fal.ai / MoneyPrinterTurbo nilainya diabaikan, jadi pilihannya disembunyikan
  // supaya tidak jadi tombol yang kelihatan berpengaruh padahal tidak.
  const [videoProvider, setVideoProvider] = useState('template');

  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [result, setResult] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [fallbackReason, setFallbackReason] = useState(null);

  const genProgress = useProgress(isGenerating, { tau: 45 });
  const renderProgress = useProgress(isRendering, {
    tau: RENDER_PACE[videoProvider] || RENDER_PACE.template,
    poll: true
  });

  useEffect(() => {
    axios
      .get('/api/settings')
      .then((res) => {
        const provider = res.data?.data?.videoConfig?.provider;
        if (provider) setVideoProvider(provider);
      })
      .catch(() => {});
  }, []);

  // Niche bisa datang dari usulan AI di luar daftar bawaan — tetap tampilkan sebagai opsi.
  const nicheOptions = NICHES.includes(niche) ? NICHES : [niche, ...NICHES];
  const toneOptions = TONES.includes(tone) ? TONES : [tone, ...TONES];

  // Hanya menghasilkan naskah & metadata. Render dan upload adalah langkah terpisah
  // di bawah, supaya user yang menentukan kapan video benar-benar dibuat.
  const handleGenerate = async () => {
    setIsGenerating(true);
    setVideoUrl(null);
    setFallbackReason(null);
    try {
      const res = await axios.post('/api/ai/generate', { topic, niche, tone });
      if (res.data?.success) setResult(res.data.data);
    } catch (error) {
      toast.error('Gagal generate naskah. Pastikan server backend berjalan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRandomTopic = async () => {
    setIsRandomizing(true);
    try {
      const res = await axios.post('/api/ai/random-topic');
      const s = res.data?.success ? res.data.data : null;
      const pick = randomPick();
      setTopic(s?.topic || pick.topic);
      setNiche(s?.niche || pick.niche);
      setTone(s?.tone || pick.tone);
    } catch (error) {
      const pick = randomPick();
      setTopic(pick.topic);
      setNiche(pick.niche);
      setTone(pick.tone);
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleRenderAndUpload = async () => {
    if (!result) return;
    setIsRendering(true);
    try {
      const res = await axios.post('/api/shorts/create-and-upload', {
        topic,
        niche,
        title: result.title,
        description: result.description,
        tags: result.tags,
        narration: result.narration,
        scenes: result.scenes,
        themeId,
        privacyStatus
      });

      if (res.data?.success) {
        const data = res.data.data;
        setVideoUrl(data.renderedVideo?.videoUrl || data.uploadResult?.localVideoUrl || null);
        setFallbackReason(data.renderedVideo?.aiVideoFallbackReason || null);
        if (onShortCreated) onShortCreated(data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal merender video.');
    } finally {
      setIsRendering(false);
    }
  };

  const copy = (value, label) => {
    const text = Array.isArray(value) ? value.join(', ') : value || '';
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} disalin.`, { duration: 2000 }))
      .catch(() => toast.error('Gagal menyalin.'));
  };

  const usedLocalGenerator = Boolean(result?.generatedBy?.includes('tidak terjangkau'));
  const skipUpload = privacyStatus === 'none';

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Studio</h1>
        <p className="page-sub">
          AI menyusun naskah, judul, deskripsi, dan tag. Setelah itu video 9:16 dirender lalu diupload.
        </p>
      </div>

      <div className="card">
        <div className="field">
          <div className="label-row">
            <label className="label" htmlFor="topic">Topik video</label>
            <button type="button" className="btn link" onClick={handleRandomTopic} disabled={isRandomizing}>
              {isRandomizing ? 'Mencari ide…' : (<><Dices size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Ide acak</>)}
            </button>
          </div>
          <textarea
            id="topic"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Misal: fakta mengejutkan tentang AI di 2026"
            className="textarea"
          />
        </div>

        <div className="grid-3 field">
          <div>
            <label className="label" htmlFor="niche">Niche</label>
            <select id="niche" value={niche} onChange={(e) => setNiche(e.target.value)} className="select">
              {nicheOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tone">Gaya narasi</label>
            <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className="select">
              {toneOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {videoProvider === 'template' && (
            <div>
              <label className="label" htmlFor="theme">Tema visual</label>
              <select id="theme" value={themeId} onChange={(e) => setThemeId(e.target.value)} className="select">
                {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <p className="hint">Warna teks di video & gaya gambar background.</p>
            </div>
          )}
        </div>

        <button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} className="btn primary">
          {isGenerating ? (<><span className="spinner" />Membuat naskah…</>) : 'Buat naskah'}
        </button>

        {genProgress.visible && (
          <ProgressBar
            percent={genProgress.percent}
            elapsed={genProgress.elapsed}
            isReal={genProgress.isReal}
            label={isGenerating ? 'Menyusun naskah dengan AI' : 'Naskah selesai'}
          />
        )}
        {isGenerating && genProgress.elapsed > 45 && (
          <p className="hint">Model AI kadang butuh beberapa menit. Proses masih berjalan.</p>
        )}
      </div>

      {result && (
        <div className="card">
          <div className="card-head head-row">
            <div>
              <h2 className="card-title">Hasil naskah</h2>
              <p className="card-sub">{result.generatedBy || 'AI'}</p>
            </div>
            {result.durationSeconds && (
              <span className="status">Perkiraan durasi {result.durationSeconds} detik</span>
            )}
          </div>

          {usedLocalGenerator && (
            <div className="note warn" style={{ marginBottom: 16 }}>
              AI utama tidak terjangkau, naskah ini dibuat generator lokal sebagai cadangan.
              Cek endpoint AI di tab Pengaturan kalau ingin kualitas naskah penuh.
            </div>
          )}

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="title">Judul</label>
              <span className="status">
                {(result.title || '').length}/60
                <button type="button" className="icon-btn" title="Salin judul" onClick={() => copy(result.title, 'Judul')}>
                  <Copy size={13} />
                </button>
              </span>
            </div>
            <input
              id="title"
              type="text"
              value={result.title}
              onChange={(e) => setResult({ ...result, title: e.target.value })}
              className="input"
            />
          </div>

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="desc">Deskripsi</label>
              <button type="button" className="icon-btn" title="Salin deskripsi" onClick={() => copy(result.description, 'Deskripsi')}>
                <Copy size={13} />
              </button>
            </div>
            <textarea
              id="desc"
              rows={3}
              value={result.description}
              onChange={(e) => setResult({ ...result, description: e.target.value })}
              className="textarea"
            />
          </div>

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="tags">Tag (pisahkan dengan koma)</label>
              <button type="button" className="icon-btn" title="Salin tag" onClick={() => copy(result.tags, 'Tag')}>
                <Copy size={13} />
              </button>
            </div>
            <input
              id="tags"
              type="text"
              value={Array.isArray(result.tags) ? result.tags.join(', ') : result.tags || ''}
              onChange={(e) => setResult({ ...result, tags: e.target.value.split(',').map((s) => s.trim()) })}
              className="input"
            />
          </div>

          {result.scenes?.length > 0 && (
            <>
              <hr className="divider" />
              <div className="label" style={{ marginBottom: 4 }}>Scene ({result.scenes.length})</div>
              <div>
                {result.scenes.map((scene, idx) => (
                  <div key={idx} className="scene">
                    <span className="scene-num">{idx + 1}</span>
                    <div>
                      <div className="scene-caption">{scene.captionText}</div>
                      {scene.narrationSegment && <div className="scene-narration">{scene.narrationSegment}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="divider" />

          <div className="head-row" style={{ alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="label" htmlFor="privacy" style={{ marginBottom: 0 }}>Setelah render</label>
              <select
                id="privacy"
                value={privacyStatus}
                onChange={(e) => setPrivacyStatus(e.target.value)}
                className="select"
                style={{ width: 'auto' }}
              >
                <option value="none">Simpan lokal saja</option>
                <option value="private">Upload privat</option>
                <option value="unlisted">Upload unlisted</option>
                <option value="public">Upload publik</option>
              </select>
            </div>

            <button onClick={handleRenderAndUpload} disabled={isRendering} className="btn primary">
              {isRendering
                ? (<><span className="spinner" />Merender…</>)
                : (skipUpload ? 'Render video' : 'Render & upload')}
            </button>
          </div>

          {renderProgress.visible && (
            <ProgressBar
              percent={renderProgress.percent}
              elapsed={renderProgress.elapsed}
              isReal={renderProgress.isReal}
              label={
                isRendering
                  ? (skipUpload ? 'Merender video' : 'Merender & mengupload video')
                  : 'Video selesai'
              }
            />
          )}
          {isRendering && (
            <p className="hint">
              Template FFmpeg biasanya cepat. Mode fal.ai atau MoneyPrinterTurbo bisa beberapa menit.
            </p>
          )}
        </div>
      )}

      {videoUrl && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Video siap</h2>
            <p className="card-sub">
              MP4 vertikal 720x1280.{skipUpload ? ' Tersimpan lokal, belum diupload ke YouTube.' : ''}
            </p>
          </div>

          {fallbackReason && (
            <div className="note" style={{ marginBottom: 16 }}>
              AI video gagal, video ini memakai template FFmpeg. Alasan: {fallbackReason}
            </div>
          )}

          <div className="video-row">
            <video src={videoUrl} controls className="video-9-16" />
            <div>
              <a href={videoUrl} download className="btn">
                <Download size={15} /> Download MP4
              </a>
              <p className="hint">Riwayat lengkap ada di tab Riwayat.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
