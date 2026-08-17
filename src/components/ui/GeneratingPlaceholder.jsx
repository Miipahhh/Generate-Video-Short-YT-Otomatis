import React, { useState, useEffect } from 'react';

// Pesan berganti-ganti selama proses AI berjalan -- BUKAN progres sungguhan (AI tidak
// streaming ke server kita, hasilnya baru ada setelah proses selesai total, lihat
// TypewriterText.jsx buat animasi naskah asli setelah itu tiba). Ini cuma dekorasi loading
// supaya prosesnya tidak terasa diam/sepi, dipilih random sekali per proses biar bervariasi
// antar percobaan. `variant` memilih set pesan yang sesuai konteks pemanggilnya.
const SCRIPT_MESSAGE_SETS = [
  ['Menyusun ide...', 'Merangkai hook pembuka...', 'Menulis narasi...', 'Menyusun scene demi scene...', 'Merapikan gaya bahasa...', 'Menambahkan detail...', 'Hampir selesai...'],
  ['Meracik topik...', 'Mencari sudut pandang menarik...', 'Menulis kalimat pembuka...', 'Membangun alur cerita...', 'Menyusun ajakan follow...', 'Poles-poles terakhir...'],
  ['Mikir dulu...', 'Nyari hook yang nendang...', 'Nulis naskah...', 'Nyusun scene...', 'Ngerapiin bahasa...', 'Bentar lagi jadi...']
];

const FACTCHECK_MESSAGE_SETS = [
  ['Membaca ulang naskah...', 'Memisahkan klaim faktual...', 'Membandingkan dengan yang diketahui...', 'Menilai akurasi tiap klaim...', 'Menyusun catatan cek fakta...', 'Hampir selesai...'],
  ['Menyisir tiap kalimat...', 'Nyari klaim yang bisa dicek...', 'Verifikasi satu-satu...', 'Kasih label akurat/meragukan/keliru...', 'Beres-beres hasilnya...'],
  ['Cek klaim satu-satu...', 'Bandingin sama fakta yang ada...', 'Nilai mana yang meragukan...', 'Susun catatan...', 'Bentar lagi kelar...']
];

const FACTFIX_MESSAGE_SETS = [
  ['Menandai kalimat bermasalah...', 'Mencari fakta pengganti yang akurat...', 'Menjaga gaya bahasa tetap sama...', 'Menyusun ulang naskah...', 'Hampir kelar...'],
  ['Merevisi klaim yang meragukan...', 'Ganti sama fakta yang lebih tepat...', 'Rapiin lagi urutan scene-nya...', 'Sentuhan akhir...'],
  ['Baca ulang klaim bermasalah...', 'Tulis ulang bagian yang keliru...', 'Cocokkan sama sisa naskah...', 'Hampir jadi...']
];

const VARIANTS = { script: SCRIPT_MESSAGE_SETS, factcheck: FACTCHECK_MESSAGE_SETS, factfix: FACTFIX_MESSAGE_SETS };

export default function GeneratingPlaceholder({ variant = 'script' }) {
  const messageSets = VARIANTS[variant] || SCRIPT_MESSAGE_SETS;
  const [messages] = useState(() => messageSets[Math.floor(Math.random() * messageSets.length)]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <p className="hint" style={{ fontStyle: 'italic' }}>
      {messages[index]}<span className="blink-cursor">▍</span>
    </p>
  );
}
