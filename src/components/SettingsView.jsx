import React, { useState, useEffect } from 'react';
import { RefreshCw, Volume2 } from 'lucide-react';
import axios from 'axios';
import { toast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.js';

const FALLBACK_MODELS = ['hermes', 'Free', 'RequirementBusinessAnalysis'];

const VIDEO_PROVIDERS = [
  { id: 'template', label: 'Template FFmpeg', note: 'Gratis, instan' },
  { id: 'fal_ai', label: 'AI video (fal.ai)', note: 'Berbayar per detik' },
  { id: 'moneyprinter', label: 'MoneyPrinterTurbo', note: 'Footage stok asli, server terpisah' }
];

export default function SettingsView({ onSaved }) {
  const [isLoading, setIsLoading] = useState(true);

  // AI
  const [aiEndpoint, setAiEndpoint] = useState('http://localhost:20128/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('hermes');
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);

  // YouTube
  const [channelName, setChannelName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState(null);

  // Video
  const [videoProvider, setVideoProvider] = useState('template');
  const [falApiKey, setFalApiKey] = useState('');
  const [falModel, setFalModel] = useState('wan/v2.6/text-to-video');
  const [aiBackgroundImages, setAiBackgroundImages] = useState(false);
  const [mptEndpoint, setMptEndpoint] = useState('http://127.0.0.1:8080');
  const [mptStatus, setMptStatus] = useState(null); // null | 'checking' | 'alive' | 'down'

  // TTS
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVoice, setTtsVoice] = useState('id-ID-GadisNeural');
  const [ttsRate, setTtsRate] = useState('+0%');
  const [ttsPitch, setTtsPitch] = useState('+0Hz');
  const [ttsVoices, setTtsVoices] = useState([]);
  const [previewing, setPreviewing] = useState(false);

  const [saving, setSaving] = useState(null); // 'ai' | 'youtube' | 'video' | 'tts'

  const fetchYoutubeStatus = async () => {
    try {
      const res = await axios.get('/api/youtube/status');
      setYoutubeStatus(res.data);
    } catch (error) {
      console.warn('Gagal memuat status YouTube.');
    }
  };

  // Daftar model diambil langsung dari endpoint yang dikonfigurasi (format OpenAI /models).
  const fetchModels = async (endpoint) => {
    setModelsLoading(true);
    try {
      const res = await axios.get(`${endpoint.replace(/\/+$/, '')}/models`, { timeout: 5000 });
      const list = (res.data?.data || []).map((m) => m.id).filter((id) => typeof id === 'string');
      setModels(list.length ? list : FALLBACK_MODELS);
    } catch (error) {
      setModels(FALLBACK_MODELS);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get('/api/settings');
        if (res.data?.success) {
          const { aiConfig, youtubeConfig, videoConfig, ttsConfig } = res.data.data;
          if (aiConfig?.aiEndpoint) setAiEndpoint(aiConfig.aiEndpoint);
          if (aiConfig?.apiKey) setApiKey(aiConfig.apiKey);
          if (aiConfig?.model) setModel(aiConfig.model);
          if (youtubeConfig?.channelName) setChannelName(youtubeConfig.channelName);
          if (youtubeConfig?.clientId) setClientId(youtubeConfig.clientId);
          if (youtubeConfig?.clientSecret) setClientSecret(youtubeConfig.clientSecret);
          if (videoConfig?.provider) setVideoProvider(videoConfig.provider);
          if (videoConfig?.falApiKey) setFalApiKey(videoConfig.falApiKey);
          if (videoConfig?.falModel) setFalModel(videoConfig.falModel);
          if (videoConfig?.aiBackgroundImages !== undefined) setAiBackgroundImages(videoConfig.aiBackgroundImages);
          if (videoConfig?.moneyPrinterEndpoint) setMptEndpoint(videoConfig.moneyPrinterEndpoint);
          if (ttsConfig?.enabled !== undefined) setTtsEnabled(ttsConfig.enabled);
          if (ttsConfig?.voice) setTtsVoice(ttsConfig.voice);
          if (ttsConfig?.rate) setTtsRate(ttsConfig.rate);
          if (ttsConfig?.pitch) setTtsPitch(ttsConfig.pitch);
          if (ttsConfig?.availableVoices) setTtsVoices(ttsConfig.availableVoices);
        }
      } catch (error) {
        console.warn('Memakai konfigurasi default.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
    fetchYoutubeStatus();
  }, []);

  useEffect(() => {
    if (aiEndpoint) fetchModels(aiEndpoint);
  }, [aiEndpoint]);

  const save = async (key, url, payload, label) => {
    setSaving(key);
    try {
      const res = await axios.post(url, payload);
      if (res.data?.youtubeStatus) setYoutubeStatus(res.data.youtubeStatus);
      toast.success(`${label} disimpan.`, { duration: 2200 });
      if (onSaved) onSaved();
    } catch (error) {
      toast.error(`Gagal menyimpan ${label.toLowerCase()}.`);
    } finally {
      setSaving(null);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirmAction('Putuskan koneksi YouTube? Upload kembali ke mode sandbox (simulasi).', {
      title: 'Putuskan koneksi',
      danger: false
    });
    if (!ok) return;
    try {
      const res = await axios.post('/api/youtube/oauth/disconnect');
      if (res.data?.youtubeStatus) setYoutubeStatus(res.data.youtubeStatus);
      if (onSaved) onSaved();
    } catch (error) {
      toast.error('Gagal memutuskan koneksi.');
    }
  };

  // Sintesis contoh kalimat pendek dengan pilihan suara saat ini, lalu langsung diputar —
  // tidak perlu disimpan dulu, jadi enak buat membanding-bandingkan suara.
  const previewVoice = async () => {
    setPreviewing(true);
    try {
      const res = await axios.post('/api/settings/tts/preview', {
        voice: ttsVoice,
        rate: ttsRate,
        pitch: ttsPitch
      });
      const url = res.data?.data?.url;
      if (url) await new Audio(url).play();
    } catch (error) {
      toast.error('Gagal membuat contoh suara.');
    } finally {
      setPreviewing(false);
    }
  };

  const pingMoneyPrinter = async () => {
    setMptStatus('checking');
    try {
      const res = await axios.get('/api/settings/moneyprinter/ping');
      setMptStatus(res.data?.data?.alive ? 'alive' : 'down');
    } catch (error) {
      setMptStatus('down');
    }
  };

  const isLocalEndpoint = /localhost|127\.0\.0\.1/.test(aiEndpoint);

  if (isLoading) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Pengaturan</h1>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card">
            <div className="skeleton" style={{ width: 180, height: 16, marginBottom: 14 }} />
            <div className="skeleton" style={{ width: '100%', height: 36, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '100%', height: 36 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Pengaturan</h1>
        <p className="page-sub">Tersimpan lokal di <code>server/data/database.json</code>.</p>
      </div>

      {/* ---------------- AI ---------------- */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">AI naskah</h2>
          <p className="card-sub">Endpoint kompatibel OpenAI, misal 9Router lokal atau OpenRouter.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save('ai', '/api/settings/ai', { aiEndpoint, apiKey, model }, 'Pengaturan AI');
          }}
        >
          <div className="field">
            <label className="label" htmlFor="ai-endpoint">Base URL</label>
            <input
              id="ai-endpoint"
              type="text"
              value={aiEndpoint}
              onChange={(e) => setAiEndpoint(e.target.value)}
              className="input"
            />
          </div>

          {!isLocalEndpoint && (
            <div className="field">
              <label className="label" htmlFor="ai-key">API key</label>
              <input
                id="ai-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-…"
                className="input"
              />
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="ai-model">Model</label>
            <div className="btn-row">
              <select
                id="ai-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="select"
                style={{ flex: '1 1 200px', width: 'auto' }}
              >
                {(models.includes(model) ? models : [model, ...models]).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={() => fetchModels(aiEndpoint)}
                title="Muat ulang daftar model"
              >
                {modelsLoading ? <span className="spinner" /> : <RefreshCw size={15} />}
              </button>
            </div>
            <p className="hint">
              {isLocalEndpoint ? 'Endpoint lokal, API key tidak diperlukan. ' : ''}
              Model <code>hermes</code> paling stabil. Model lain otomatis fallback ke hermes kalau gagal.
            </p>
          </div>

          <button type="submit" className="btn primary" disabled={saving === 'ai'}>
            {saving === 'ai' ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </div>

      {/* ---------------- YOUTUBE ---------------- */}
      <div className="card">
        <div className="card-head head-row">
          <div>
            <h2 className="card-title">YouTube</h2>
            <p className="card-sub">Kredensial OAuth Google untuk upload otomatis.</p>
          </div>
          <span className="status">
            <span className={`dot ${youtubeStatus?.isOAuthConnected ? 'on' : 'off'}`} />
            {youtubeStatus?.isOAuthConnected ? `Terhubung — ${youtubeStatus.channelName}` : 'Sandbox (simulasi)'}
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save('youtube', '/api/settings/youtube', { channelName, clientId, clientSecret }, 'Kredensial YouTube');
          }}
        >
          <div className="field">
            <label className="label" htmlFor="yt-channel">Nama channel</label>
            <input
              id="yt-channel"
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid-2 field">
            <div>
              <label className="label" htmlFor="yt-id">Client ID</label>
              <input
                id="yt-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxx.apps.googleusercontent.com"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="yt-secret">Client secret</label>
              <input
                id="yt-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-…"
                className="input"
              />
            </div>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={saving === 'youtube'}>
              {saving === 'youtube' ? 'Menyimpan…' : 'Simpan'}
            </button>
            {youtubeStatus?.isOAuthConnected ? (
              <button type="button" className="btn" onClick={handleDisconnect}>Putuskan koneksi</button>
            ) : (
              <a
                href="/api/youtube/oauth/connect"
                className="btn"
                style={clientId && clientSecret ? undefined : { pointerEvents: 'none', opacity: 0.55 }}
              >
                Hubungkan Google
              </a>
            )}
          </div>

          <p className="hint">
            Tambahkan URI ini sebagai authorized redirect URI di Google Cloud Console:{' '}
            <code>{youtubeStatus?.redirectUri || 'http://localhost:5173/api/youtube/oauth/callback'}</code>
          </p>
        </form>
      </div>

      {/* ---------------- VIDEO ---------------- */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Sumber video</h2>
          <p className="card-sub">Menentukan bagaimana visual video 9:16 dibuat.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(
              'video',
              '/api/settings/video',
              { provider: videoProvider, falApiKey, falModel, aiBackgroundImages, moneyPrinterEndpoint: mptEndpoint },
              'Pengaturan video'
            );
          }}
        >
          <div className="field radio-row">
            {VIDEO_PROVIDERS.map((p) => (
              <label key={p.id} className={`radio ${videoProvider === p.id ? 'checked' : ''}`}>
                <input
                  type="radio"
                  name="videoProvider"
                  value={p.id}
                  checked={videoProvider === p.id}
                  onChange={() => setVideoProvider(p.id)}
                />
                <span>{p.label}</span>
                <span className="stat-note" style={{ marginTop: 0 }}>— {p.note}</span>
              </label>
            ))}
          </div>

          {videoProvider === 'moneyprinter' && (
            <div className="field">
              <label className="label" htmlFor="mpt">Endpoint MoneyPrinterTurbo</label>
              <div className="btn-row">
                <input
                  id="mpt"
                  type="text"
                  value={mptEndpoint}
                  onChange={(e) => setMptEndpoint(e.target.value)}
                  className="input"
                  style={{ flex: '1 1 200px', width: 'auto' }}
                />
                <button type="button" className="btn" onClick={pingMoneyPrinter} disabled={mptStatus === 'checking'}>
                  {mptStatus === 'checking' ? <span className="spinner" /> : 'Cek koneksi'}
                </button>
              </div>
              {mptStatus === 'alive' && <p className="hint"><span className="dot on" /> Server terjangkau.</p>}
              {mptStatus === 'down' && <p className="hint"><span className="dot off" /> Server tidak merespons. Jalankan <code>start-moneyprinter.bat</code> dulu.</p>}
              <p className="hint">Server Python terpisah yang mengambil footage stok Pexels/Pixabay lalu membakar subtitle.</p>
            </div>
          )}

          {(videoProvider === 'fal_ai' || aiBackgroundImages) && (
            <div className="grid-2 field">
              <div>
                <label className="label" htmlFor="fal-key">Fal.ai API key</label>
                <input
                  id="fal-key"
                  type="password"
                  value={falApiKey}
                  onChange={(e) => setFalApiKey(e.target.value)}
                  className="input"
                />
              </div>
              {videoProvider === 'fal_ai' && (
                <div>
                  <label className="label" htmlFor="fal-model">Model fal.ai</label>
                  <input
                    id="fal-model"
                    type="text"
                    value={falModel}
                    onChange={(e) => setFalModel(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>
          )}

          {videoProvider === 'fal_ai' && (
            <p className="hint" style={{ marginBottom: 16 }}>
              Video dibatasi 5/10/15 detik oleh model dan butuh 30 detik–3 menit per video.
              Kalau gagal, otomatis fallback ke template FFmpeg.
            </p>
          )}

          <div className="field">
            <label className="switch-row">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={aiBackgroundImages}
                  onChange={(e) => setAiBackgroundImages(e.target.checked)}
                />
                <span className="switch-track" />
              </span>
              Background gambar AI per scene
            </label>
            <p className="hint">
              Berlaku di mode template. Butuh fal.ai API key (~$0.003/gambar), fallback ke foto stok kalau gagal.
            </p>
          </div>

          <button type="submit" className="btn primary" disabled={saving === 'video'}>
            {saving === 'video' ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </div>

      {/* ---------------- TTS ---------------- */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Narator suara</h2>
          <p className="card-sub">Suara neural Microsoft Edge, gratis tanpa API key. Coba dulu sebelum menyimpan.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(
              'tts',
              '/api/settings/tts',
              { enabled: ttsEnabled, voice: ttsVoice, rate: ttsRate, pitch: ttsPitch },
              'Pengaturan narator'
            );
          }}
        >
          <div className="field">
            <label className="switch-row">
              <span className="switch">
                <input type="checkbox" checked={ttsEnabled} onChange={(e) => setTtsEnabled(e.target.checked)} />
                <span className="switch-track" />
              </span>
              Bacakan naskah jadi suara
            </label>
            <p className="hint">Kalau nonaktif atau gagal, video memakai audio ambient placeholder.</p>
          </div>

          {ttsEnabled && (
            <>
              <div className="field">
                <label className="label" htmlFor="tts-voice">Suara</label>
                <select id="tts-voice" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} className="select">
                  {(ttsVoices.length ? ttsVoices : [{ id: ttsVoice, label: ttsVoice }]).map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid-2 field">
                <div>
                  <label className="label" htmlFor="tts-rate">Kecepatan</label>
                  <select id="tts-rate" value={ttsRate} onChange={(e) => setTtsRate(e.target.value)} className="select">
                    <option value="-15%">Lebih lambat</option>
                    <option value="-7%">Agak lambat</option>
                    <option value="+0%">Normal</option>
                    <option value="+15%">Lebih cepat</option>
                    <option value="+30%">Cepat sekali</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="tts-pitch">Nada</label>
                  <select id="tts-pitch" value={ttsPitch} onChange={(e) => setTtsPitch(e.target.value)} className="select">
                    <option value="-8Hz">Lebih berat</option>
                    <option value="-4Hz">Agak berat</option>
                    <option value="+0Hz">Normal</option>
                    <option value="+4Hz">Agak cerah</option>
                    <option value="+8Hz">Lebih cerah</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <button type="button" className="btn" onClick={previewVoice} disabled={previewing}>
                  {previewing ? (<><span className="spinner" />Menyiapkan…</>) : (<><Volume2 size={15} /> Dengar contoh</>)}
                </button>
                <p className="hint">
                  Contoh memakai pilihan di atas tanpa perlu disimpan dulu. Suara berlabel "logat asing"
                  terdengar lebih luwes, tapi pelafalan Indonesianya tidak sesempurna Gadis/Ardi.
                </p>
              </div>
            </>
          )}

          <button type="submit" className="btn primary" disabled={saving === 'tts'}>
            {saving === 'tts' ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </div>
    </div>
  );
}
