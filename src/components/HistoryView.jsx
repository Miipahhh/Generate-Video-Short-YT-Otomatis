import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Play, Download, Search, ExternalLink, BarChart2, Repeat, FileText, RefreshCw } from 'lucide-react';
import VideoPreviewModal from './ui/VideoPreviewModal.jsx';
import ShortDetailModal from './ui/ShortDetailModal.jsx';
import axios from 'axios';
import { toast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.js';
import { startContinuation } from '../lib/studioStore.js';

const videoUrlOf = (item) => item.renderedVideo?.videoUrl || item.uploadResult?.localVideoUrl || null;

// Niche cerita/naratif — satu-satunya jenis konten yang masuk akal dilanjutkan sebagai
// "Part 2", karena eksplisit ditutup ajakan follow buat lanjutannya (lihat aturan naskah
// di aiService.js). Fakta/tips berdiri sendiri per video, tidak punya alur cerita untuk disambung.
const isNarrativeNiche = (niche) => /fiksi|cerita|misteri|horor|konspirasi/i.test(niche || '');

const formatNum = (n) => (Number.isFinite(n) ? n.toLocaleString('id-ID') : '—');

export default function HistoryView({ onNavigate }) {
  const [shorts, setShorts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [query, setQuery] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);

  useEffect(() => {
    const fetchShorts = async () => {
      try {
        const res = await axios.get('/api/shorts');
        if (res.data?.success) setShorts(res.data.data);
      } catch (error) {
        toast.error('Gagal memuat riwayat.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchShorts();
  }, []);

  const handleDelete = async (id, title) => {
    const ok = await confirmAction(`Hapus "${title}" dari riwayat? File MP4-nya tidak bisa dikembalikan.`, {
      title: 'Hapus video'
    });
    if (!ok) return;
    try {
      const res = await axios.delete(`/api/shorts/${id}`);
      if (res.data?.success) {
        setShorts((prev) => prev.filter((item) => item.id !== id));
        toast.success(`"${title}" dan file MP4-nya sudah dihapus.`, { duration: 3000 });
      }
    } catch (error) {
      toast.error('Gagal menghapus video.');
    }
  };

  const handleRefreshInsights = async (id) => {
    setRefreshingId(id);
    try {
      const res = await axios.post(`/api/shorts/${id}/insights`);
      if (res.data?.success) {
        const insights = res.data.data;
        setShorts((prev) => prev.map((item) => (item.id === id ? { ...item, insights } : item)));
        if (!insights.available) toast.error(insights.message || 'Data performa belum tersedia.');
      }
    } catch (error) {
      toast.error('Gagal mengambil data performa.');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleContinuation = (item) => {
    startContinuation(item);
    if (onNavigate) onNavigate('studio');
    toast.success(`Lanjutan "${item.title}" siap direview di tab Studio.`, { duration: 4000 });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shorts;
    return shorts.filter(
      (item) =>
        (item.title || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q)
    );
  }, [shorts, query]);

  return (
    <div>
      {selected && (
        <VideoPreviewModal
          title={selected.title}
          videoUrl={videoUrlOf(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {detailItem && (
        <ShortDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}

      <div className="page-head head-row">
        <div>
          <h1 className="page-title">Riwayat</h1>
          <p className="page-sub">{shorts.length} video tersimpan.</p>
        </div>
        {shorts.length > 0 && (
          <div className="search">
            <Search size={15} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul atau deskripsi…"
              className="input"
            />
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          [0, 1, 2].map((i) => (
            <div key={i} style={{ padding: '14px 0' }}>
              <div className="skeleton" style={{ width: '55%', height: 15, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '85%', height: 13 }} />
            </div>
          ))
        ) : shorts.length === 0 ? (
          <div className="empty">Belum ada video. Buat yang pertama di tab Studio.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Tidak ada video yang cocok dengan "{query}".</div>
        ) : (
          filtered.map((item) => {
            const url = videoUrlOf(item);
            // facebookVideoUrl untuk record baru; youtubeShortsUrl tetap didukung buat record
            // lama dari sebelum aplikasi pindah ke Facebook.
            const facebookUrl = item.uploadResult?.facebookVideoUrl;
            const youtubeUrl = item.uploadResult?.youtubeShortsUrl;

            return (
              <div key={item.id} className="history-item">
                <div className="history-main">
                  <div className="history-title">{item.title}</div>
                  <div className="history-desc">{item.description}</div>
                  <div className="history-meta">
                    <span>
                      {new Date(item.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                    <span>{item.type === 'MANUAL_STUDIO' ? 'Manual' : 'Otomatis'}</span>
                    {item.type === 'AUTO_SCHEDULED_BLOCKED' ? (
                      <span title={item.safetyCheck?.overallNote || ''} style={{ color: 'var(--accent)' }}>
                        ditahan cek keamanan — belum dirender
                      </span>
                    ) : (
                      <>
                        {!url && <span>MP4 tidak tersedia</span>}
                        {item.uploadResult?.success === false && <span>belum terupload</span>}
                      </>
                    )}
                    {facebookUrl && (
                      <a href={facebookUrl} target="_blank" rel="noopener noreferrer">
                        Facebook <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                      </a>
                    )}
                    {!facebookUrl && youtubeUrl && (
                      <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                        YouTube <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                      </a>
                    )}
                    {item.insights?.available && (
                      <span title="Data performa dari Facebook Insights">
                        <BarChart2 size={11} style={{ verticalAlign: -1 }} /> {formatNum(item.insights.views)} tontonan
                        {Number.isFinite(item.insights.avgWatchTimeSeconds) && ` • rata-rata ${item.insights.avgWatchTimeSeconds}dtk`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="history-actions">
                  {url && (
                    <>
                      <button className="btn sm" onClick={() => setSelected(item)}>
                        <Play size={13} /> Putar
                      </button>
                      <a href={url} download className="btn sm" title="Download MP4">
                        <Download size={13} />
                      </a>
                    </>
                  )}
                  <button className="icon-btn" onClick={() => setDetailItem(item)} title="Lihat detail (deskripsi, tag, caption siap tempel)">
                    <FileText size={15} />
                  </button>
                  {facebookUrl && item.uploadResult?.videoId && (
                    <button
                      className="icon-btn"
                      onClick={() => handleRefreshInsights(item.id)}
                      disabled={refreshingId === item.id}
                      title="Muat ulang data performa (views/reach) dari Facebook"
                    >
                      <RefreshCw size={15} className={refreshingId === item.id ? 'spin' : ''} />
                    </button>
                  )}
                  {isNarrativeNiche(item.niche) && url && (
                    <button
                      className="icon-btn"
                      onClick={() => handleContinuation(item)}
                      title="Buat naskah lanjutan (Part berikutnya) dari video ini"
                    >
                      <Repeat size={15} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() => handleDelete(item.id, item.title)}
                    title="Hapus video"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
