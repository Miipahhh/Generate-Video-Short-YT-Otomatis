import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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

export default function SchedulerView({ onShortCreated }) {
  const [config, setConfig] = useState(null);
  const [newTopic, setNewTopic] = useState('');
  const [newNiche, setNewNiche] = useState(NICHES[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);

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
      if (res.data?.success) setConfig(res.data.data);
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
      if (res.data?.success) setConfig(res.data.data);
    } catch (error) {
      toast.error('Gagal menghapus topik.');
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
            elapsed={progress.elapsed}
            isReal={progress.isReal}
            label={isExecuting ? 'Membuat naskah, merender, lalu upload' : 'Eksekusi selesai'}
          />
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Antrean topik ({queue.length})</h2>
          <p className="card-sub">Topik dijalankan berurutan dari atas.</p>
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
                  </div>
                </div>
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
    </div>
  );
}
