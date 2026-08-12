import React from 'react';
import { Copy, Dices, Download, ShieldCheck } from 'lucide-react';
import { toast } from '../lib/toast.js';
import { useStudioState } from '../lib/useStudioState.js';
import {
  NICHES,
  TONES,
  THEMES,
  DURATION_OPTIONS,
  setTopic,
  setNiche,
  setTone,
  setThemeId,
  setPrivacyStatus,
  setTargetDuration,
  patchResult,
  randomizeTopic,
  generateScript,
  renderAndUpload,
  factCheckScript
} from '../lib/studioStore.js';
import ProgressBar from './ui/ProgressBar.jsx';

const VERDICT_LABEL = {
  akurat: 'Akurat',
  meragukan: 'Meragukan',
  keliru: 'Keliru',
  tidak_bisa_dipastikan: 'Tidak bisa dipastikan'
};

const VERDICT_CLASS = {
  akurat: 'success',
  meragukan: 'warn',
  keliru: 'danger',
  tidak_bisa_dipastikan: 'muted'
};

// genProgress & renderProgress dioper dari App.jsx (bukan dihitung sendiri di sini) supaya
// timernya tidak reset tiap komponen ini di-mount ulang — itu terjadi setiap kali user buka
// tab Studio, karena App.jsx me-mount/unmount komponen ini tiap ganti tab. App.jsx sendiri
// tidak pernah unmount selama sesi berjalan, jadi progres yang dihitung di sana aman dipakai
// bersama oleh bar di halaman ini maupun pill status yang tampil di halaman lain.
export default function ShortsStudioView({ onShortCreated, genProgress, renderProgress }) {
  const studio = useStudioState();
  const {
    topic, niche, tone, themeId, privacyStatus, targetDuration, videoProvider,
    isRandomizing, isGenerating, isRendering, isFactChecking,
    result, videoUrl, fallbackReason, factCheck
  } = studio;

  // Niche/tone bisa datang dari usulan AI di luar daftar bawaan — tetap tampilkan sebagai opsi.
  const nicheOptions = NICHES.includes(niche) ? NICHES : [niche, ...NICHES];
  const toneOptions = TONES.includes(tone) ? TONES : [tone, ...TONES];

  const copy = (value, label) => {
    const text = Array.isArray(value) ? value.join(', ') : value || '';
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} disalin.`, { duration: 2000 }))
      .catch(() => toast.error('Gagal menyalin.'));
  };

  const usedLocalGenerator = Boolean(result?.generatedBy?.includes('tidak terjangkau'));
  const skipUpload = privacyStatus === 'none';
  const isNarrativeNiche = /fiksi|cerita|misteri|horor|konspirasi/i.test(niche);

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
            <button type="button" className="btn link" onClick={randomizeTopic} disabled={isRandomizing}>
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
          <div>
            <label className="label" htmlFor="duration">Target durasi</label>
            <select
              id="duration"
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              className="select"
            >
              {DURATION_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {targetDuration === 'random' && (
              <p className="hint">Tiap klik "Buat naskah" dapat target durasi acak berbeda (±30 detik – 6 menit, tergantung niche).</p>
            )}
          </div>
        </div>

        {videoProvider === 'template' && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label className="label" htmlFor="theme">Tema visual</label>
            <select id="theme" value={themeId} onChange={(e) => setThemeId(e.target.value)} className="select">
              {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <p className="hint">Warna teks di video & gaya gambar background.</p>
          </div>
        )}

        <button onClick={generateScript} disabled={isGenerating || !topic.trim()} className="btn primary">
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
              onChange={(e) => patchResult({ title: e.target.value })}
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
              onChange={(e) => patchResult({ description: e.target.value })}
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
              onChange={(e) => patchResult({ tags: e.target.value.split(',').map((s) => s.trim()) })}
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

          <div className="label-row">
            <label className="label" style={{ marginBottom: 0 }}>Cek fakta naskah</label>
            <button type="button" className="btn sm" onClick={factCheckScript} disabled={isFactChecking}>
              {isFactChecking ? (<><span className="spinner" />Memeriksa…</>) : (<><ShieldCheck size={13} /> Cek fakta</>)}
            </button>
          </div>

          {isNarrativeNiche && !factCheck && (
            <p className="hint">Niche ini cenderung cerita fiksi — klaim faktual mungkin memang tidak ada.</p>
          )}

          {factCheck && (
            <div style={{ marginTop: 10 }}>
              <div className="note" style={{ marginBottom: 10 }}>
                Dicek oleh model AI yang sama (bukan pencarian internet) — anggap sebagai saringan awal,
                bukan sumber kebenaran akhir. Untuk klaim penting, tetap verifikasi manual.
              </div>

              {factCheck.claims?.length > 0 ? (
                <div className="list">
                  {factCheck.claims.map((c, idx) => (
                    <div key={idx} className="list-item" style={{ alignItems: 'flex-start' }}>
                      <div className="list-item-main" style={{ flex: 1 }}>
                        <div className="list-item-title">{c.claim}</div>
                        {c.note && <div className="list-item-meta">{c.note}</div>}
                      </div>
                      <span className={`fact-verdict ${VERDICT_CLASS[c.verdict] || 'muted'}`}>
                        {VERDICT_LABEL[c.verdict] || c.verdict}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">Tidak ada klaim faktual spesifik yang terdeteksi di naskah ini.</div>
              )}

              {factCheck.overallNote && <p className="hint" style={{ marginTop: 10 }}>{factCheck.overallNote}</p>}
            </div>
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

            <button onClick={() => renderAndUpload(onShortCreated)} disabled={isRendering} className="btn primary">
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
