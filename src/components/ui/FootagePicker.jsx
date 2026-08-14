import React, { useRef, useState } from 'react';
import { Upload, Trash2, Play, ChevronUp, ChevronDown } from 'lucide-react';
import { useStudioState } from '../../lib/useStudioState.js';
import {
  setUseLocalFootage,
  uploadFootageFiles,
  deleteFootageClip,
  toggleFootageSelected,
  moveFootageSelected
} from '../../lib/studioStore.js';
import { confirmAction } from '../../lib/confirm.js';
import VideoPreviewModal from './VideoPreviewModal.jsx';

/**
 * Footage milik user sendiri buat mode MoneyPrinterTurbo — dipakai untuk topik tentang orang
 * atau momen spesifik yang memang tidak akan pernah ada di stok Pexels/Pixabay (lihat
 * moneyPrinterService.js/aiService.generateVideoSearchTerms). Naskah, suara, subtitle, dan
 * potong-sambung tetap otomatis; user cuma menyediakan bahan visualnya.
 */
export default function FootagePicker() {
  const { useLocalFootage, footageLibrary, selectedFootage, isFootageBusy } = useStudioState();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const handleFiles = (e) => {
    uploadFootageFiles(e.target.files);
    e.target.value = ''; // supaya file yang sama bisa dipilih lagi kalau perlu
  };

  const handleDelete = async (filename) => {
    const ok = await confirmAction(`Hapus footage "${filename}"? File-nya tidak bisa dikembalikan.`, {
      title: 'Hapus footage'
    });
    if (!ok) return;
    deleteFootageClip(filename);
  };

  return (
    <div className="field">
      <label className="switch-row">
        <span className="switch">
          <input
            type="checkbox"
            checked={useLocalFootage}
            onChange={(e) => setUseLocalFootage(e.target.checked)}
          />
          <span className="switch-track" />
        </span>
        Pakai footage saya sendiri
      </label>
      <p className="hint">
        Buat topik tentang orang/momen spesifik yang memang tidak ada di stok Pexels/Pixabay
        (mis. tokoh publik). Upload klip yang hak pakainya jelas milikmu — naskah, suara,
        subtitle, dan potong-sambung tetap otomatis seperti biasa, cuma sumber visualnya dari
        file ini, bukan hasil pencarian stok.
      </p>

      {useLocalFootage && (
        <div style={{ marginTop: 10 }}>
          {preview && (
            <VideoPreviewModal title={preview.filename} videoUrl={preview.url} onClose={() => setPreview(null)} />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
            multiple
            hidden
            onChange={handleFiles}
          />
          <button
            type="button"
            className="btn sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFootageBusy}
          >
            {isFootageBusy ? (<><span className="spinner" />Memproses…</>) : (<><Upload size={13} /> Upload footage</>)}
          </button>

          {footageLibrary.length === 0 ? (
            <div className="empty" style={{ marginTop: 10 }}>Belum ada footage. Upload dulu video yang mau dipakai.</div>
          ) : (
            <div className="list" style={{ marginTop: 10 }}>
              {footageLibrary.map((clip) => {
                const order = selectedFootage.indexOf(clip.filename);
                const isSelected = order !== -1;
                return (
                  <div key={clip.filename} className="list-item">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFootageSelected(clip.filename)}
                      />
                      <div className="list-item-main" style={{ minWidth: 0 }}>
                        <div className="list-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isSelected && <span className="index" style={{ marginRight: 6 }}>{order + 1}</span>}
                          {clip.filename}
                        </div>
                        <div className="list-item-meta">{(clip.sizeBytes / 1024 / 1024).toFixed(1)} MB</div>
                      </div>
                    </label>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {isSelected && (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Naikkan urutan"
                            disabled={order === 0}
                            onClick={() => moveFootageSelected(clip.filename, -1)}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Turunkan urutan"
                            disabled={order === selectedFootage.length - 1}
                            onClick={() => moveFootageSelected(clip.filename, 1)}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </>
                      )}
                      <button type="button" className="icon-btn" title="Putar" onClick={() => setPreview(clip)}>
                        <Play size={13} />
                      </button>
                      <button type="button" className="icon-btn" title="Hapus" onClick={() => handleDelete(clip.filename)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedFootage.length > 0 ? (
            <p className="hint" style={{ marginTop: 8 }}>
              {selectedFootage.length} klip dipilih — urutan di atas menentukan urutan tempel ke video.
            </p>
          ) : (
            <p className="hint" style={{ marginTop: 8 }}>
              Belum ada klip dipilih — centang klip di atas, atau render akan jatuh ke pencarian stok otomatis.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
