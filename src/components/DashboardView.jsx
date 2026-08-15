import React from 'react';
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

const PROVIDER_LABEL = {
  template: 'Template FFmpeg',
  fal_ai: 'AI Video (fal.ai)',
  moneyprinter: 'MoneyPrinterTurbo'
};

export default function DashboardView({
  systemStatus, onNavigate,
  isGenerating, isRendering, videoProvider, genProgress, renderProgress
}) {
  const scheduler = systemStatus?.schedulerConfig;
  const facebook = systemStatus?.facebookStatus;
  const queue = scheduler?.topicQueue?.filter((t) => t.status !== 'COMPLETED') || [];
  const lastRun = scheduler?.executionLog?.[0];

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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head head-row">
          <div>
            <h2 className="card-title">Antrean topik</h2>
            <p className="card-sub">
              {scheduler?.isAutoPilotEnabled
                ? 'Auto-pilot mengambil topik teratas setiap jadwal.'
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
                  <div className="list-item-meta">{item.niche}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
