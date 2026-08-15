import React, { useState, useEffect, useRef } from 'react';

/**
 * Efek visual "sedang diketik" di frontend — AI naskah TIDAK streaming token per token ke
 * server kita (lihat aiService.js: semua panggilan pakai stream:false, jawabannya dikirim
 * utuh sekali jadi setelah generate selesai). Begitu naskah lengkap sudah ada, komponen ini
 * mengungkap teksnya berangsur karakter demi karakter, biar kerasa seperti lagi ditulis —
 * bukan tiba-tiba muncul utuh sekaligus.
 *
 * Animasi ulang otomatis tiap kali `text` berubah (naskah baru/direvisi), dan berhenti
 * sendiri begitu teksnya sudah utuh ditampilkan.
 */
export default function TypewriterText({ text = '', speed = 14, charsPerTick = 2, className }) {
  const [shownLength, setShownLength] = useState(0);
  const fullTextRef = useRef(text);

  useEffect(() => {
    fullTextRef.current = text;
    setShownLength(0);
    if (!text) return undefined;

    let i = 0;
    const interval = setInterval(() => {
      i += charsPerTick;
      setShownLength(Math.min(i, fullTextRef.current.length));
      if (i >= fullTextRef.current.length) clearInterval(interval);
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, charsPerTick]);

  return <div className={className}>{text.slice(0, shownLength)}</div>;
}
