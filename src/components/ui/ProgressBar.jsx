import React from 'react';
import { formatElapsed } from '../../lib/useProgress.js';

/**
 * Bar loading untuk proses panjang. `isReal` menandai angkanya datang dari server
 * (MoneyPrinterTurbo); kalau tidak, angkanya perkiraan dari waktu berjalan dan
 * ditandai jelas supaya tidak terbaca sebagai progres pasti. `remaining` (detik) adalah
 * hitung mundur perkiraan sisa waktu, bukan waktu yang sudah berlalu.
 */
export default function ProgressBar({ percent = 0, remaining = 0, label, isReal = false }) {
  const value = Math.min(100, Math.round(percent));
  const timeLabel = value >= 100
    ? 'selesai'
    : remaining > 0
      ? `sisa ~${formatElapsed(remaining)}`
      : 'sebentar lagi';

  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`progress-fill ${value < 100 ? 'running' : ''}`} style={{ width: `${value}%` }} />
      </div>
      <div className="progress-meta">
        <span>{label}</span>
        <span>
          {value}%{isReal ? '' : ' (perkiraan)'} · {timeLabel}
        </span>
      </div>
    </div>
  );
}
