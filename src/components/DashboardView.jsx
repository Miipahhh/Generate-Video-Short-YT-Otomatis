import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import axios from 'axios';
import ProgressBar from './ui/ProgressBar.jsx';

function formatNextRun(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

const PROVIDER_LABEL = {
  template: 'Template FFmpeg',
  fal_ai: 'AI Video (fal.ai)',
  moneyprinter: 'MoneyPrinterTurbo'
};

/** Titik status hijau/merah/abu-abu untuk panel "Status Sistem". `alive === null` berarti
 * belum selesai dicek (masih loading), bukan mati. */
function HealthDot({ label, alive, note }) {
  return (
    <div className="list-item">
      {alive === null ? (
        <span className="spinner" />
      ) : alive ? (
        <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
      ) : (
        <XCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
      )}
      <div className="list-item-main" style={{ flex: 1 }}>
        <div className="list-item-title">{label}</div>
        {note && <div className="list-item-meta">{note}</div>}
      </div>
    </div>
  );
}

export default function DashboardView({
  systemStatus, onNavigate,
  isGenerating, isRendering, videoProvider, genProgress, renderProgress
}) {
  const scheduler = systemStatus?.schedulerConfig;
  const facebook = systemStatus?.facebookStatus;
  const queue = scheduler?.topicQueue?.filter((t) => t.status !== 'COMPLETED') || [];
  const readyCount = queue.filter((t) => t.status === 'READY').length;
  const lastRun = scheduler?.executionLog?.[0];

  const [recentShorts, setRecentShorts] = useState([]);
  const [config, setConfig] = useState(null);
  const [aiAlive, setAiAlive] = useState(null);
  const [mptAlive, setMptAlive] = useState(null);

  useEffect(() => {
    axios.get('/api/shorts').then((res) => {
      if (res.data?.success) setRecentShorts(res.data.data.slice(0, 5));
    }).catch(() => {});

    axios.get('/api/settings').then((res) => {
      if (res.data?.success) setConfig(res.data.data);
    }).catch(() => {});

    axios.get('/api/ai/ping').then((res) => {
      setAiAlive(Boolean(res.data?.data?.alive));
    }).catch(() => setAiAlive(false));
  }, []);

  // MoneyPrinterTurbo cuma relevan buat dicek kalau memang provider video aktifnya itu —
  // nunggu config termuat dulu (bukan videoProvider dari props, itu cuma dipakai selagi render
  // sedang berjalan) supaya tidak salah cek provider yang tidak dipakai.
  useEffect(() => {
    if (config?.videoConfig?.provider !== 'moneyprinter') return;
    axios.get('/api/settings/moneyprinter/ping').then((res) => {
      setMptAlive(Boolean(res.data?.data?.alive));
    }).catch(() => setMptAlive(false));
  }, [config?.videoConfig?.provider]);

  const stats = [
    {
      label: 'Short dibuat',
      value: systemStatus ? systemStatus.totalShortsCreated : '—'
    },
    {
      label: 'Facebook',
      value: facebook?.isConnected ? 'Terhubung' : 'Sandbox',
      note: facebook?.isConnected ? facebook.pageName : 'Upload masih simulasi'
    },
    {
      label: 'Jadwal berikutnya',
      value: scheduler?.isAutoPilotEnabled ? formatNextRun(scheduler.nextScheduledRun) : 'Nonaktif',
      note: scheduler?.isAutoPilotEnabled ? 'Senin, Rabu, Jumat 18:00' : 'Auto-pilot dimatikan'
    },
    {
      label: 'Model AI',
      value: systemStatus?.aiConfig?.model || '—',
      note: systemStatus?.aiConfig?.apiEndpoint
    }
  ];

  return (
    <div>
      <div className="page-head head-row">
        <div>
          <h1 className="page-title">Dasbor</h1>
          <p className="page-sub">Ringkasan status studio, jadwal, dan antrean topik.</p>
        </div>
        <button className="btn primary" onClick={() => onNavigate('studio')}>
          Buat short baru
        </button>
      </div>

      {!systemStatus && (
        <div className="note" style={{ marginBottom: 16 }}>
          Backend belum terhubung. Jalankan <code>npm run dev</code> lalu muat ulang halaman.
        </div>
      )}

      {lastRun?.status === 'failed' && (
        <div className="note danger" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => onNavigate('scheduler')}>
          <strong>Eksekusi auto-pilot terakhir gagal</strong> — {lastRun.message}. Klik untuk lihat detail di tab Jadwal.
        </div>
      )}
      {lastRun?.status === 'blocked' && (
        <div className="note warn" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => onNavigate('scheduler')}>
          <strong>Auto-pilot menahan 1 video</strong> karena cek keamanan konten — perlu direview manual. Klik untuk lihat detail.
        </div>
      )}

      {(isGenerating || isRendering) && (
        <div className="card" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => onNavigate('studio')}>
          <div className="card-head head-row">
            <div>
              <h2 className="card-title">
                {isGenerating ? 'Menyusun naskah…' : `Merender video… (${PROVIDER_LABEL[videoProvider] || videoProvider})`}
              </h2>
              <p className="card-sub">Klik untuk buka tab Studio.</p>
            </div>
          </div>
          <ProgressBar
            percent={isGenerating ? genProgress.percent : renderProgress.percent}
            remaining={isGenerating ? genProgress.remaining : renderProgress.remaining}
            isReal={isGenerating ? genProgress.isReal : renderProgress.isReal}
            label={isGenerating ? 'Menyusun naskah dengan AI' : 'Progres render'}
          />
        </div>
      )}

      <div className="stats">
        {stats.map((stat) => (
          <div key={stat.label} className="stat">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            {stat.note && <div className="stat-note">{stat.note}</div>}
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-head head-row">
            <div>
              <h2 className="card-title">Riwayat terbaru</h2>
              <p className="card-sub">5 short terakhir yang dibuat.</p>
            </div>
            <button className="btn sm" onClick={() => onNavigate('history')}>Lihat semua</button>
          </div>

          {recentShorts.length === 0 ? (
            <div className="empty">Belum ada video. Buat yang pertama di tab Studio.</div>
          ) : (
            <div className="list">
              {recentShorts.map((item) => {
                const facebookUrl = item.uploadResult?.facebookVideoUrl;
                return (
                  <div key={item.id} className="list-item">
                    <div className="list-item-main" style={{ flex: 1 }}>
                      <div className="list-item-title">{item.title}</div>
                      <div className="list-item-meta">
                        {formatShortDate(item.createdAt)}
                        {' • '}
                        {item.type === 'AUTO_SCHEDULED_BLOCKED'
                          ? 'ditahan cek keamanan'
                          : facebookUrl
                            ? 'terupload'
                            : item.uploadResult?.success === false
                              ? 'gagal upload'
                              : 'lokal saja'}
                      </div>
                    </div>
                    {facebookUrl && (
                      <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Buka di Facebook">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="card-head">
            <h2 className="card-title">Status sistem</h2>
            <p className="card-sub">Cek cepat servis yang dipakai buat generate & render.</p>
          </div>
          <div className="list">
            <HealthDot label="9Router / AI naskah" alive={aiAlive} note={systemStatus?.aiConfig?.apiEndpoint} />
            {config?.videoConfig?.provider === 'moneyprinter' && (
              <HealthDot label="MoneyPrinterTurbo" alive={mptAlive} note={config.videoConfig.moneyPrinterEndpoint} />
            )}
            <HealthDot
              label="Narator suara (TTS)"
              alive={config ? Boolean(config.ttsConfig?.enabled) : null}
              note={config?.ttsConfig?.enabled ? 'Aktif' : 'Nonaktif'}
            />
            <HealthDot
              label="Fakta terkini (Tavily)"
              alive={config ? Boolean(config.searchConfig?.enabled && config.searchConfig?.hasApiKey) : null}
              note={config?.searchConfig?.enabled ? 'Aktif' : 'Nonaktif'}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head head-row">
          <div>
            <h2 className="card-title">Antrean topik</h2>
            <p className="card-sub">
              {scheduler?.isAutoPilotEnabled
                ? `Auto-pilot mengambil topik teratas setiap jadwal.${queue.length > 0 ? ` ${readyCount}/${queue.length} sudah punya naskah siap (kalender konten).` : ''}`
                : 'Auto-pilot nonaktif, antrean tidak dijalankan otomatis.'}
            </p>
          </div>
          <button className="btn" onClick={() => onNavigate('scheduler')}>Kelola jadwal</button>
        </div>

        {queue.length === 0 ? (
          <div className="empty">
            Antrean kosong. Kalau jadwal tiba, sistem meminta topik acak dari AI.
          </div>
        ) : (
          <div className="list">
            {queue.slice(0, 5).map((item, idx) => (
              <div key={item.id} className="list-item">
                <span className="index">{idx + 1}</span>
                <div className="list-item-main" style={{ flex: 1 }}>
                  <div className="list-item-title">{item.topic}</div>
                  <div className="list-item-meta">
                    {item.niche}
                    {item.status === 'READY' && ' • naskah siap'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
