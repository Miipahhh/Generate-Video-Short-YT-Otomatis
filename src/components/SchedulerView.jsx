import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle, ShieldAlert, Wand2, CalendarClock } from 'lucide-react';
import axios from 'axios';
import { toast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.js';
import { useProgress } from '../lib/useProgress.js';
import ProgressBar from './ui/ProgressBar.jsx';

const NICHES = [
  'Teknologi & AI',
  'Misteri & horor',
  'Cerita fiksi pendek',
  'Sejarah tersembunyi',
  'Kesehatan & sains',
  'Keuangan & investasi',
  'Konspirasi & urban legend',
  'Motivasi & karir'
];

const EXECUTION_STATUS = {
  success: { icon: CheckCircle2, color: 'var(--success)', label: 'Berhasil' },
  failed: { icon: XCircle, color: 'var(--danger)', label: 'Gagal' },
  blocked: { icon: ShieldAlert, color: 'var(--accent)', label: 'Ditahan cek keamanan' }
};

function formatLogTime(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

export default function SchedulerView({ onShortCreated }) {
  const [config, setConfig] = useState(null);
  const [newTopic, setNewTopic] = useState('');
  const [newNiche, setNewNiche] = useState(NICHES[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pregeneratingId, setPregeneratingId] = useState(null);
  const [isPregeneratingAll, setIsPregeneratingAll] = useState(false);

  // Satu eksekusi = generate naskah + render + upload, jadi lajunya dipatok lebih lambat
  // dari sekadar generate naskah. Progres asli dipakai kalau rendernya lewat MoneyPrinterTurbo.
  const progress = useProgress(isExecuting, { tau: 180, poll: true });

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/scheduler/config');
      if (res.data?.success) setConfig(res.data.data);
    } catch (error) {
      toast.error('Gagal memuat konfigurasi jadwal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleToggle = async () => {
    if (!config) return;
    try {
      const res = await axios.post('/api/scheduler/config', { enabled: !config.isAutoPilotEnabled });
      if (res.data?.success) {
        setConfig(res.data.data);
        toast.success(
          res.data.data.isAutoPilotEnabled ? 'Auto-pilot diaktifkan.' : 'Auto-pilot dinonaktifkan.',
          { duration: 2500 }
        );
      }
    } catch (error) {
      toast.error('Gagal mengubah status auto-pilot.');
    }
  };

  const handleAddTopic = async (e) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    try {
      const res = await axios.post('/api/scheduler/topic-queue', { topic: newTopic.trim(), niche: newNiche });
      if (res.data?.success) {
        setConfig(res.data.data);
        toast.success(`"${newTopic.trim()}" masuk antrean.`, { duration: 2500 });
        setNewTopic('');
      }
    } catch (error) {
      toast.error('Gagal menambahkan topik.');
    }
  };

  const handleDelete = async (id, label) => {
    const ok = await confirmAction(`Hapus "${label}" dari antrean?`, { title: 'Hapus topik' });
    if (!ok) return;
    try {
      const res = await axios.delete(`/api/scheduler/topic-queue/${id}`);
      if (res.data?.success) {
        setConfig(res.data.data);
        toast.success(`"${label}" dihapus dari antrean.`, { duration: 2500 });
      }
    } catch (error) {
      toast.error('Gagal menghapus topik.');
    }
  };

  const handlePregenerate = async (id) => {
    setPregeneratingId(id);
    try {
      const res = await axios.post(`/api/scheduler/topic-queue/${id}/pregenerate`);
      if (res.data?.success) {
        setConfig(res.data.data);
        toast.success('Naskah siap — auto-pilot tinggal render saat jadwalnya tiba.', { duration: 3000 });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal generate naskah topik ini.');
    } finally {
      setPregeneratingId(null);
    }
  };

  const handlePregenerateAll = async () => {
    setIsPregeneratingAll(true);
    try {
      const res = await axios.post('/api/scheduler/topic-queue/pregenerate-all');
      if (res.data?.success) {
        const { done, failed, config: newConfig } = res.data.data;
        setConfig(newConfig);
        if (failed.length > 0) {
          toast.error(`${done} naskah siap, ${failed.length} gagal (${failed.map((f) => f.topic).join(', ')}).`, { duration: 8000 });
        } else if (done === 0) {
          toast('Tidak ada topik yang perlu digenerate (semua sudah siap atau antrean kosong).', { duration: 3000 });
        } else {
          toast.success(`${done} naskah siap — auto-pilot tinggal render saat jadwalnya tiba.`, { duration: 4000 });
        }
      }
    } catch (error) {
      toast.error('Gagal generate naskah batch.');
    } finally {
      setIsPregeneratingAll(false);
    }
  };

  const handleRunNow = async () => {
    setIsExecuting(true);
    try {
      const res = await axios.post('/api/scheduler/run-now');
      if (res.data?.success) {
        if (onShortCreated) onShortCreated(res.data.data);
        fetchConfig();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal menjalankan jadwal.');
    } finally {
      setIsExecuting(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Jadwal</h1>
        </div>
        <div className="card">
          <div className="skeleton" style={{ width: 220, height: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '100%', height: 36 }} />
        </div>
      </div>
    );
  }

  const queue = config?.topicQueue || [];
  const executionLog = config?.executionLog || [];
  const lastRun = executionLog[0];

  return (
    <div>
      <div className="page-head head-row">
        <div>
          <h1 className="page-title">Jadwal</h1>
          <p className="page-sub">
            Auto-pilot berjalan Senin, Rabu, dan Jumat pukul 18:00 WIB dari antrean topik di bawah.
          </p>
        </div>
        <button className="btn" onClick={handleRunNow} disabled={isExecuting}>
          {isExecuting ? (<><span className="spinner" />Memproses…</>) : 'Jalankan sekarang'}
        </button>
      </div>

      {lastRun?.status === 'failed' && (
        <div className="note danger" style={{ marginBottom: 16 }}>
          <strong>Eksekusi terakhir gagal</strong> ({formatLogTime(lastRun.timestamp)}): {lastRun.message}
          {' '}— topik "{lastRun.topic}" otomatis dikembalikan ke antrean, akan dicoba lagi jadwal berikutnya.
        </div>
      )}

      <div className="card">
        <label className="switch-row">
          <span className="switch">
            <input type="checkbox" checked={Boolean(config?.isAutoPilotEnabled)} onChange={handleToggle} />
            <span className="switch-track" />
          </span>
          Auto-pilot aktif
        </label>
        <p className="hint">
          Kalau aktif, sistem membuat dan mengupload video otomatis sesuai jadwal. Antrean kosong berarti
          topik diminta dari AI.
        </p>

        {progress.visible && (
          <ProgressBar
            percent={progress.percent}
            remaining={progress.remaining}
            isReal={progress.isReal}
            label={isExecuting ? 'Membuat naskah, merender, lalu upload' : 'Eksekusi selesai'}
          />
        )}
      </div>

      <div className="card">
        <div className="card-head head-row">
          <div>
            <h2 className="card-title">Antrean topik ({queue.length})</h2>
            <p className="card-sub">
              Topik dijalankan berurutan dari atas. "Generate semua naskah" menyiapkan naskah lebih awal
              (kalender konten) supaya saat jadwalnya tiba, auto-pilot tinggal render — bukan generate dadakan.
            </p>
          </div>
          {queue.some((t) => t.status === 'PENDING') && (
            <button className="btn sm" onClick={handlePregenerateAll} disabled={isPregeneratingAll}>
              {isPregeneratingAll
                ? (<><span className="spinner" />Menyiapkan naskah…</>)
                : (<><CalendarClock size={13} /> Generate semua naskah</>)}
            </button>
          )}
        </div>

        <form onSubmit={handleAddTopic} className="btn-row" style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Topik baru…"
            className="input"
            style={{ flex: '1 1 240px', width: 'auto' }}
          />
          <select
            value={newNiche}
            onChange={(e) => setNewNiche(e.target.value)}
            className="select"
            style={{ flex: '0 1 190px', width: 'auto' }}
          >
            {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="submit" className="btn" disabled={!newTopic.trim()}>
            <Plus size={15} /> Tambah
          </button>
        </form>

        {queue.length === 0 ? (
          <div className="empty">Belum ada topik dalam antrean.</div>
        ) : (
          <div className="list">
            {queue.map((item, idx) => (
              <div key={item.id} className="list-item">
                <span className="index">{idx + 1}</span>
                <div className="list-item-main" style={{ flex: 1 }}>
                  <div className="list-item-title">{item.topic}</div>
                  <div className="list-item-meta">
                    {item.niche}
                    {item.status === 'COMPLETED' && ' • sudah dijalankan'}
                    {item.status === 'PROCESSING' && ' • sedang diproses'}
                    {item.status === 'GENERATING' && ' • sedang menyiapkan naskah…'}
                    {item.status === 'READY' && ' • naskah siap'}
                  </div>
                </div>
                {(item.status === 'PENDING' || !item.status) && (
                  <button
                    className="icon-btn"
                    onClick={() => handlePregenerate(item.id)}
                    disabled={pregeneratingId === item.id}
                    title="Siapkan naskah lebih awal buat topik ini"
                  >
                    {pregeneratingId === item.id ? <span className="spinner" /> : <Wand2 size={15} />}
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => handleDelete(item.id, item.topic)}
                  title="Hapus topik"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Riwayat eksekusi</h2>
          <p className="card-sub">
            Setiap kali auto-pilot (atau "Jalankan sekarang") jalan, hasilnya dicatat di sini —
            supaya kegagalan tidak cuma kelihatan di log server yang tidak pernah kamu buka.
          </p>
        </div>

        {executionLog.length === 0 ? (
          <div className="empty">Belum ada eksekusi yang tercatat.</div>
        ) : (
          <div className="list">
            {executionLog.map((entry) => {
              const meta = EXECUTION_STATUS[entry.status] || EXECUTION_STATUS.failed;
              const Icon = meta.icon;
              return (
                <div key={entry.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <Icon size={16} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
                  <div className="list-item-main" style={{ flex: 1 }}>
                    <div className="list-item-title">{entry.topic || '(topik tidak tercatat)'}</div>
                    <div className="list-item-meta">
                      {meta.label} • {formatLogTime(entry.timestamp)}
                      {entry.message && <> — {entry.message}</>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
