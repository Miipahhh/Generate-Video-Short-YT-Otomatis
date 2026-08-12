import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Play, Download, Search, ExternalLink } from 'lucide-react';
import VideoPreviewModal from './ui/VideoPreviewModal.jsx';
import axios from 'axios';
import { toast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.js';

const videoUrlOf = (item) => item.renderedVideo?.videoUrl || item.uploadResult?.localVideoUrl || null;

export default function HistoryView() {
  const [shorts, setShorts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

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
      if (res.data?.success) setShorts((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      toast.error('Gagal menghapus video.');
    }
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
                    {!url && <span>MP4 tidak tersedia</span>}
                    {item.uploadResult?.success === false && <span>belum terupload</span>}
                    {youtubeUrl && (
                      <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                        YouTube <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                      </a>
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
