import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { subscribeToast } from '../../lib/toast.js';

export default function ToastHost() {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToast((item) => {
      setItems((prev) => [...prev, item]);
      if (item.duration > 0) {
        setTimeout(() => dismiss(item.id), item.duration);
      }
    });
    return unsubscribe;
  }, [dismiss]);

  if (!items.length) return null;

  return (
    <div className="toast-stack">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.type || 'info'}`}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {item.title && <div className="toast-title">{item.title}</div>}
            <div className="toast-msg">{item.message}</div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                {item.linkLabel || 'Buka link'}
              </a>
            )}
          </div>
          <button className="icon-btn" onClick={() => dismiss(item.id)} aria-label="Tutup notifikasi">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
