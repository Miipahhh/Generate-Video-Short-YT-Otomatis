import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Bar berhenti di 95% selama proses masih jalan — 100% cuma dipakai kalau benar-benar selesai,
// supaya bar tidak "penuh" lalu diam lama (itu yang bikin loading terasa menggantung).
const CAP = 95;

/**
 * Progres untuk proses yang lamanya tidak bisa dipastikan (generate naskah & render video).
 *
 * Dua sumber angka:
 *  1. Progres SUNGGUHAN dari server (dipakai kalau `poll` aktif dan render sedang berjalan
 *     lewat MoneyPrinterTurbo, satu-satunya renderer yang melaporkan persentase).
 *  2. Perkiraan dari waktu berjalan: kurva melambat (1 - e^-t/tau) yang terus bergerak tapi
 *     tidak pernah menyentuh 100. `tau` kira-kira separuh durasi normal proses tersebut.
 *
 * Nilainya tidak pernah turun, karena bar yang mundur terlihat seperti aplikasi rusak.
 */
export function useProgress(active, { tau = 45, poll = false } = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [isReal, setIsReal] = useState(false);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      setVisible(true);
      setPercent(0);
      setElapsed(0);
      setIsReal(false);

      const startedAt = Date.now();
      const id = setInterval(() => {
        const seconds = (Date.now() - startedAt) / 1000;
        setElapsed(Math.floor(seconds));
        setPercent((prev) => Math.max(prev, CAP * (1 - Math.exp(-seconds / tau))));
      }, 500);
      return () => clearInterval(id);
    }

    // Baru saja selesai: penuhkan bar dulu sebentar supaya jelas prosesnya kelar, baru hilang.
    if (wasActive.current) {
      wasActive.current = false;
      setPercent(100);
      const id = setTimeout(() => setVisible(false), 800);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [active, tau]);

  useEffect(() => {
    if (!active || !poll) return undefined;
    let stopped = false;

    const check = async () => {
      try {
        const res = await axios.get('/api/render/progress');
        const data = res.data?.data;
        if (!stopped && data?.active && Number.isFinite(data.percent)) {
          setIsReal(true);
          setPercent((prev) => Math.max(prev, Math.min(CAP, data.percent)));
        }
      } catch (error) {
        // Gagal ambil progres bukan masalah — bar tetap jalan pakai perkiraan waktu.
      }
    };

    check();
    const id = setInterval(check, 4000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, poll]);

  // Perkiraan SISA waktu (hitung mundur), bukan waktu yang sudah berlalu — lebih kebayang
  // "berapa lama lagi" daripada "sudah berapa lama".
  //  - Progres asli (isReal, dari MoneyPrinterTurbo): ekstrapolasi linear dari laju sejauh ini
  //    (elapsed/percent), sama seperti ETA pada umumnya.
  //  - Progres perkiraan (kurva tau): total durasi "normal" dianggap ~2x tau (`tau` memang
  //    dipilih sebagai kira-kira separuh durasi normal, lihat komentar di atas), sisa waktu =
  //    total itu dikurangi yang sudah berlalu. Kalau proses ternyata lebih lama dari biasanya,
  //    sisa waktu mentok di 0 (UI menampilkan "sebentar lagi", bukan angka negatif atau macet
  //    di "0:00" yang keliru terkesan sudah selesai).
  let remaining = 0;
  if (visible) {
    if (isReal && percent > 3) {
      const estimatedTotal = (elapsed * 100) / percent;
      remaining = Math.max(0, Math.round(estimatedTotal - elapsed));
    } else {
      remaining = Math.max(0, Math.round(tau * 2 - elapsed));
    }
  }

  return { percent, elapsed, remaining, visible, isReal };
}

export function formatElapsed(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
