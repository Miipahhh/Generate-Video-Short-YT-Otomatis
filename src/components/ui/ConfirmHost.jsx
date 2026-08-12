import React, { useEffect, useState, useCallback } from 'react';
import { registerConfirmOpener } from '../../lib/confirm.js';

export default function ConfirmHost() {
  const [state, setState] = useState(null); // { message, resolve, title, danger }

  const open = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, title: opts.title || 'Konfirmasi', danger: opts.danger !== false });
    });
  }, []);

  useEffect(() => {
    registerConfirmOpener(open);
  }, [open]);

  if (!state) return null;

  const close = (result) => {
    state.resolve(result);
    setState(null);
  };

  return (
    <div className="overlay" onClick={() => close(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{state.title}</div>
        <p className="dialog-text">{state.message}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={() => close(false)}>Batal</button>
          <button
            className={`btn ${state.danger ? 'danger' : 'primary'}`}
            onClick={() => close(true)}
          >
            {state.danger ? 'Hapus' : 'Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
