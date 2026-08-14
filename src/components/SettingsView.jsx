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

  // Facebook Page (target upload otomatis saat ini)
  const [pageName, setPageName] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [facebookStatus, setFacebookStatus] = useState(null);
  const [fbCheckStatus, setFbCheckStatus] = useState(null); // null | 'checking' | 'alive' | 'down'

  // Video
  const [videoProvider, setVideoProvider] = useState('template');
  const [falApiKey, setFalApiKey] = useState('');
  const [falModel, setFalModel] = useState('wan/v2.6/text-to-video');
  const [aiBackgroundImages, setAiBackgroundImages] = useState(false);
  const [mptEndpoint, setMptEndpoint] = useState('http://127.0.0.1:8080');
  const [mptStatus, setMptStatus] = useState(null); // null | 'checking' | 'alive' | 'down'

  // Pencarian web (Tavily) — fakta terkini buat naskah & cek fakta
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState('');

  // TTS
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVoice, setTtsVoice] = useState('id-ID-GadisNeural');
  const [ttsRate, setTtsRate] = useState('+0%');
  const [ttsPitch, setTtsPitch] = useState('+0Hz');
  const [ttsVoices, setTtsVoices] = useState([]);
  const [previewing, setPreviewing] = useState(false);

  const [saving, setSaving] = useState(null); // 'ai' | 'facebook' | 'video' | 'tts' | 'search'

  const fetchFacebookStatus = async () => {
    try {
      const res = await axios.get('/api/facebook/status');
      setFacebookStatus(res.data);
    } catch (error) {
      console.warn('Gagal memuat status Facebook.');
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
          const { aiConfig, facebookConfig, videoConfig, ttsConfig, searchConfig } = res.data.data;
          if (aiConfig?.aiEndpoint) setAiEndpoint(aiConfig.aiEndpoint);
          if (aiConfig?.apiKey) setApiKey(aiConfig.apiKey);
          if (aiConfig?.model) setModel(aiConfig.model);
          if (facebookConfig?.pageName) setPageName(facebookConfig.pageName);
          if (facebookConfig?.pageId) setPageId(facebookConfig.pageId);
          if (facebookConfig?.pageAccessToken) setPageAccessToken(facebookConfig.pageAccessToken);
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
          if (searchConfig?.enabled !== undefined) setSearchEnabled(searchConfig.enabled);
          if (searchConfig?.tavilyApiKey) setTavilyApiKey(searchConfig.tavilyApiKey);
        }
      } catch (error) {
        console.warn('Memakai konfigurasi default.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
    fetchFacebookStatus();
  }, []);

  useEffect(() => {
    if (aiEndpoint) fetchModels(aiEndpoint);
  }, [aiEndpoint]);

  const save = async (key, url, payload, label) => {
    setSaving(key);
    try {
      const res = await axios.post(url, payload);
      if (res.data?.facebookStatus) setFacebookStatus(res.data.facebookStatus);
      toast.success(`${label} disimpan.`, { duration: 2200 });
      if (onSaved) onSaved();
    } catch (error) {
      toast.error(`Gagal menyimpan ${label.toLowerCase()}.`);
    } finally {
      setSaving(null);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirmAction('Putuskan koneksi Facebook Page? Upload kembali ke mode sandbox (simulasi).', {
      title: 'Putuskan koneksi',
      danger: false
    });
    if (!ok) return;
    try {
      const res = await axios.post('/api/facebook/disconnect');
      if (res.data?.facebookStatus) setFacebookStatus(res.data.facebookStatus);
      toast.success('Koneksi Facebook diputus, kembali ke mode sandbox.', { duration: 3000 });
      if (onSaved) onSaved();
    } catch (error) {
      toast.error('Gagal memutuskan koneksi.');
    }
  };

  const checkFacebookConnection = async () => {
    setFbCheckStatus('checking');
    try {
      const res = await axios.post('/api/facebook/verify');
      setFbCheckStatus(res.data?.data?.alive ? 'alive' : 'down');
      if (res.data?.data?.pageName) setPageName(res.data.data.pageName);
    } catch (error) {
      setFbCheckStatus('down');
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

      {/* ---------------- PENCARIAN WEB (FAKTA TERKINI) ---------------- */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Fakta terkini (pencarian web)</h2>
          <p className="card-sub">
            AI naskah cuma tahu apa yang ada di data latihannya, bisa ketinggalan buat topik yang
            butuh info baru. Aktifkan ini supaya naskah & cek fakta disuntik hasil pencarian web
            asli lewat <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">Tavily</a> (gratis 1.000 pencarian/bulan).
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save('search', '/api/settings/search', { enabled: searchEnabled, tavilyApiKey }, 'Pengaturan pencarian web');
          }}
        >
          <div className="field">
            <label className="switch-row">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={searchEnabled}
                  onChange={(e) => setSearchEnabled(e.target.checked)}
                />
                <span className="switch-track" />
              </span>
              Suntik fakta terkini dari pencarian web
            </label>
            <p className="hint">
              Kalau nonaktif atau API key kosong, naskah & cek fakta tetap jalan seperti biasa
              (murni dari pengetahuan model AI), bukan sumber kebenaran akhir.
            </p>
          </div>

          {searchEnabled && (
            <div className="field">
              <label className="label" htmlFor="tavily-key">Tavily API key</label>
              <input
                id="tavily-key"
                type="password"
                value={tavilyApiKey}
                onChange={(e) => setTavilyApiKey(e.target.value)}
                placeholder="tvly-…"
                className="input"
              />
              <p className="hint">
                Daftar gratis di <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">app.tavily.com</a>, salin API key, tempel di sini.
              </p>
            </div>
          )}

          <button type="submit" className="btn primary" disabled={saving === 'search'}>
            {saving === 'search' ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </div>

      {/* ---------------- FACEBOOK PAGE ---------------- */}
      <div className="card">
        <div className="card-head head-row">
          <div>
            <h2 className="card-title">Facebook Page</h2>
            <p className="card-sub">Page Access Token untuk upload otomatis ke Facebook.</p>
          </div>
          <span className="status">
            <span className={`dot ${facebookStatus?.isConnected ? 'on' : 'off'}`} />
            {facebookStatus?.isConnected ? `Terhubung — ${facebookStatus.pageName}` : 'Sandbox (simulasi)'}
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save('facebook', '/api/settings/facebook', { pageName, pageId, pageAccessToken }, 'Kredensial Facebook');
          }}
        >
          <div className="field">
            <label className="label" htmlFor="fb-name">Nama Page</label>
            <input
              id="fb-name"
              type="text"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid-2 field">
            <div>
              <label className="label" htmlFor="fb-id">Page ID</label>
              <input
                id="fb-id"
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="1234567890"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="fb-token">Page Access Token</label>
              <input
                id="fb-token"
                type="password"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder="EAAG…"
                className="input"
              />
            </div>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={saving === 'facebook'}>
              {saving === 'facebook' ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button type="button" className="btn" onClick={checkFacebookConnection} disabled={fbCheckStatus === 'checking' || !pageId || !pageAccessToken}>
              {fbCheckStatus === 'checking' ? <span className="spinner" /> : 'Cek koneksi'}
            </button>
            {facebookStatus?.isConnected && (
              <button type="button" className="btn" onClick={handleDisconnect}>Putuskan koneksi</button>
            )}
          </div>
          {fbCheckStatus === 'alive' && <p className="hint"><span className="dot on" /> Page terjangkau & token valid.</p>}
          {fbCheckStatus === 'down' && <p className="hint"><span className="dot off" /> Page ID/token tidak valid, atau tidak terjangkau. Cek ulang di Meta for Developers.</p>}

          <p className="hint">
            Page ID & Page Access Token didapat sendiri dari{' '}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">Meta for Developers</a>{' '}
            (App milik Anda sendiri, admin Page yang sama) — bukan lewat redirect aplikasi ini. Izin yang dibutuhkan:{' '}
            <code>pages_manage_posts</code> dan <code>pages_read_engagement</code>. Detail langkah-langkah ada di README.
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
