import React, { useState, useEffect } from 'react';

// Pesan berganti-ganti selama naskah digenerate -- BUKAN naskah sungguhan yang lagi ditulis
// (AI tidak streaming ke server kita, jawabannya baru ada setelah generate selesai total,
// lihat TypewriterText.jsx buat animasi naskah asli setelah itu tiba). Ini cuma dekorasi
// loading supaya prosesnya tidak terasa diam, dipilih random sekali per generate biar
// bervariasi antar percobaan.
const MESSAGE_SETS = [
  ['Menyusun ide...', 'Merangkai hook pembuka...', 'Menulis narasi...', 'Menyusun scene demi scene...', 'Merapikan gaya bahasa...', 'Menambahkan detail...', 'Hampir selesai...'],
  ['Meracik topik...', 'Mencari sudut pandang menarik...', 'Menulis kalimat pembuka...', 'Membangun alur cerita...', 'Menyusun ajakan follow...', 'Poles-poles terakhir...'],
  ['Mikir dulu...', 'Nyari hook yang nendang...', 'Nulis naskah...', 'Nyusun scene...', 'Ngerapiin bahasa...', 'Bentar lagi jadi...']
];

export default function GeneratingPlaceholder() {
  const [messages] = useState(() => MESSAGE_SETS[Math.floor(Math.random() * MESSAGE_SETS.length)]);
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
