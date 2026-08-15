import React, { useState, useEffect } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';
import axios from 'axios';

import DashboardView from './components/DashboardView.jsx';
import ShortsStudioView from './components/ShortsStudioView.jsx';
import SchedulerView from './components/SchedulerView.jsx';
import HistoryView from './components/HistoryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import ToastHost from './components/ui/ToastHost.jsx';
import ConfirmHost from './components/ui/ConfirmHost.jsx';
import { toast } from './lib/toast.js';
import { useStudioState } from './lib/useStudioState.js';
import { initStudio, RENDER_PACE } from './lib/studioStore.js';
import { useProgress } from './lib/useProgress.js';

const NAV = [
  { id: 'dashboard', label: 'Dasbor' },
  { id: 'studio', label: 'Studio' },
  { id: 'scheduler', label: 'Jadwal' },
  { id: 'history', label: 'Riwayat' },
  { id: 'settings', label: 'Pengaturan' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemStatus, setSystemStatus] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');

  // State Studio (naskah, render, dst) hidup di luar komponen ShortsStudioView, supaya
  // tidak reset saat pindah tab. Progres generate/render dihitung SEKALI di sini (bukan di
  // dalam ShortsStudioView) supaya angkanya konsisten dipakai baik oleh bar di halaman
  // Studio maupun pill status yang tampil di halaman lain.
  const studio = useStudioState();
  const genProgress = useProgress(studio.isGenerating, { tau: 45 });
  const renderProgress = useProgress(studio.isRendering, {
    tau: RENDER_PACE[studio.videoProvider] || RENDER_PACE.template,
    poll: true
  });
  // Cek fakta biasanya cepat (satu panggilan AI ringan, bukan generate naskah/render video),
  // jadi tau-nya dibikin jauh lebih kecil supaya bar-nya kelihatan bergerak wajar, bukan
  // merambat lambat seperti proses berat.
  const factCheckProgress = useProgress(studio.isFactChecking, { tau: 12 });
  const activeStudioProgress = studio.isGenerating ? genProgress : renderProgress;
  const showStudioPill = activeTab !== 'studio' && (studio.isGenerating || studio.isRendering);

  useEffect(() => {
    initStudio();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }, [theme]);

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/status');
      setSystemStatus(response.data);
    } catch (error) {
      console.warn('Backend belum terhubung.');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleShortCreated = (newShort) => {
    const upload = newShort.uploadResult;

    // Auto-pilot memblokir upload otomatis kalau cek keamanan konten menandai risiko — video
    // TIDAK dirender/upload sama sekali, tapi tetap masuk Riwayat buat direview manual. Ini
    // bukan kegagalan teknis, jadi jangan dikira "berhasil" (hijau) ataupun "error" (merah).
    if (newShort.type === 'AUTO_SCHEDULED_BLOCKED') {
      toast(newShort.safetyCheck?.overallNote || 'Auto-pilot menahan topik ini karena berpotensi melanggar guideline.', {
        title: `Auto-pilot ditahan — "${newShort.title}"`,
        type: 'info',
        duration: 12000
      });
      fetchStatus();
      return;
    }

    // Video bisa selesai dirender tapi gagal diupload (token Facebook kedaluwarsa, dll).
    // Kasus itu diberi tahu apa adanya, bukan disamarkan jadi notifikasi sukses.
    if (upload && upload.success === false) {
      toast.error(upload.error || 'Video berhasil dirender, tapi gagal diupload ke Facebook.', {
        title: 'Upload Facebook gagal',
        duration: 14000
      });
    } else if (!upload) {
      // User memilih render saja, jadi jangan sampai notifikasinya terkesan sudah diupload.
      toast.success(`${newShort.title} — tersimpan lokal, tidak diupload.`, {
        title: 'Video selesai dirender',
        duration: 8000
      });
    } else {
      toast.success(newShort.title, {
        title: 'Video short selesai dibuat',
        url: upload?.facebookVideoUrl,
        linkLabel: 'Buka di Facebook',
        duration: 8000
      });
    }
    fetchStatus();
  };

  const goTo = (id) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => goTo('dashboard')}>
            AI Shorts Studio
          </button>

          <nav className="tabs">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                className={`tab ${activeTab === item.id ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="btn-row">
            <button
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="icon-btn menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        <div className={`mobile-tabs ${menuOpen ? 'open' : ''}`}>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className={`tab ${activeTab === item.id ? 'active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <ToastHost />
      <ConfirmHost />

      {/* Studio bisa lagi generate/render sementara user pindah ke halaman lain — pill ini
          jadi satu-satunya jejak bahwa prosesnya masih jalan, karena kartu progres di
          halaman Studio sendiri tidak kelihatan selagi tidak sedang dibuka. */}
      {showStudioPill && (
        <button className="studio-pill" onClick={() => goTo('studio')}>
          <span className="spinner" />
          <span>
            {studio.isGenerating ? 'Menyusun naskah…' : 'Merender video…'} {Math.round(activeStudioProgress.percent)}%
          </span>
        </button>
      )}

      <main className="page">
        {activeTab === 'dashboard' && <DashboardView systemStatus={systemStatus} onNavigate={setActiveTab} />}
        {activeTab === 'studio' && (
          <ShortsStudioView
            onShortCreated={handleShortCreated}
            genProgress={genProgress}
            renderProgress={renderProgress}
            factCheckProgress={factCheckProgress}
          />
        )}
        {activeTab === 'scheduler' && <SchedulerView onShortCreated={handleShortCreated} />}
        {activeTab === 'history' && <HistoryView onNavigate={setActiveTab} />}
        {activeTab === 'settings' && <SettingsView onSaved={fetchStatus} />}
      </main>
    </div>
  );
}
