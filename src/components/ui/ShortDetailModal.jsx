import React, { useEffect } from 'react';
import { Copy } from 'lucide-react';
import { toast } from '../../lib/toast.js';

const copyText = (value, label) => {
  const text = Array.isArray(value) ? value.join(', ') : value || '';
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`${label} disalin.`, { duration: 2000 }))
    .catch(() => toast.error('Gagal menyalin.'));
};

function CopyField({ id, label, value, multiline, rows = 3 }) {
  const text = Array.isArray(value) ? value.join(', ') : value || '';
  return (
    <div className="field">
      <div className="label-row">
        <label className="label" htmlFor={id}>{label}</label>
        <button type="button" className="icon-btn" title={`Salin ${label.toLowerCase()}`} onClick={() => copyText(value, label)}>
          <Copy size={13} />
        </button>
      </div>
      {multiline ? (
        <textarea id={id} readOnly rows={rows} value={text || '—'} className="textarea" onFocus={(e) => e.target.select()} />
      ) : (
        <input id={id} readOnly type="text" value={text || '—'} className="input" onFocus={(e) => e.target.select()} />
      )}
    </div>
  );
}

/**
 * Detail lengkap satu short (deskripsi, tag, caption siap tempel, naskah) supaya upload manual
 * ke Facebook — atau platform lain — tidak perlu mengetik ulang dari nol. Berguna terutama untuk
 * video yang di-render dengan "Simpan lokal saja" (tidak diupload otomatis).
 */
export default function ShortDetailModal({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tagArray = Array.isArray(item.tags) ? item.tags : (item.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const hashtags = tagArray.slice(0, 10).map((t) => '#' + t.replace(/[^a-zA-Z0-9]/g, '')).filter((t) => t.length > 1).join(' ');
  const readyCaption = [item.title, item.description, hashtags].filter(Boolean).join('\n\n');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Detail short</div>

        <CopyField id="detail-title" label="Judul" value={item.title} />
        <CopyField id="detail-desc" label="Deskripsi" value={item.description} multiline />
        <CopyField id="detail-tags" label="Tag" value={tagArray} />
        <CopyField
          id="detail-caption"
          label="Caption siap tempel (judul + deskripsi + hashtag)"
          value={readyCaption}
          multiline
          rows={5}
        />

        {item.narration && (
          <details>
            <summary className="label" style={{ cursor: 'pointer', marginBottom: 8 }}>Naskah narasi lengkap</summary>
            <CopyField id="detail-narration" label="Naskah narasi" value={item.narration} multiline rows={6} />
          </details>
        )}

        <div className="dialog-actions">
          <button className="btn primary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
