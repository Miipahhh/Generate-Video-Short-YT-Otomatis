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

  // Hasil redirect dari alur OAuth Google (/api/youtube/oauth/callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube') === 'connected') {
      setActiveTab('settings');
      toast.success('Akun Google tersambung. Upload berikutnya masuk ke channel asli.', { title: 'YouTube terhubung' });
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    }
  }, []);

  const handleShortCreated = (newShort) => {
    const upload = newShort.uploadResult;

    // Video bisa selesai dirender tapi gagal diupload (izin Google kedaluwarsa, kuota habis).
    // Kasus itu diberi tahu apa adanya, bukan disamarkan jadi notifikasi sukses.
    if (upload && upload.success === false) {
      toast.error(upload.error || 'Video berhasil dirender, tapi gagal diupload ke YouTube.', {
        title: 'Upload YouTube gagal',
        duration: 14000
      });
    } else {
      toast.success(newShort.title, {
        title: 'Video short selesai dibuat',
        url: upload?.youtubeShortsUrl,
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

      <main className="page">
        {activeTab === 'dashboard' && <DashboardView systemStatus={systemStatus} onNavigate={setActiveTab} />}
        {activeTab === 'studio' && <ShortsStudioView onShortCreated={handleShortCreated} />}
        {activeTab === 'scheduler' && <SchedulerView onShortCreated={handleShortCreated} />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'settings' && <SettingsView onSaved={fetchStatus} />}
      </main>
    </div>
  );
}
