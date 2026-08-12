import React, { useEffect } from 'react';
import { Download } from 'lucide-react';

export default function VideoPreviewModal({ title, videoUrl, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>

        <video
          src={videoUrl}
          controls
          autoPlay
          style={{ width: '100%', maxHeight: '60vh', marginTop: 14, borderRadius: 8, background: '#000' }}
        />

        <div className="dialog-actions">
          <a href={videoUrl} download className="btn">
            <Download size={15} /> Download MP4
          </a>
          <button className="btn primary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
