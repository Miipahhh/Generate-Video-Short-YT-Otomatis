// State halaman Studio hidup di sini, bukan di dalam komponen React. Bug yang diperbaiki:
// sebelumnya App.jsx me-mount/unmount <ShortsStudioView> tiap ganti tab, jadi (1) topik &
// naskah yang sudah digenerate hilang begitu pindah tab lalu balik lagi, dan (2) request
// generate/render yang sedang berjalan "kehilangan" tempat menaruh hasilnya begitu
// komponennya di-unmount, sehingga status prosesnya tidak kelihatan dari halaman lain.
//
// Modul biasa (bukan React state) tidak ikut hilang saat komponen unmount, dan aksi
// async di bawah (generateScript, renderAndUpload, dst) dipanggil di luar siklus render —
// jadi tetap jalan sampai selesai walau user sudah pindah ke tab lain. Pola pub/sub ini
// sama seperti toast.js/confirm.js yang sudah dipakai di app ini.
import axios from 'axios';
import { toast } from './toast.js';

// Bank topik lintas genre — dipakai sebagai topik awal dan cadangan tombol "Ide acak"
// kalau AI tidak terjangkau.
export const TOPIC_BANK = [
  { topic: 'Fakta AI yang bakal ganti pekerjaan manusia', niche: 'Teknologi & AI', tone: 'Energik & viral' },
  { topic: 'Misteri rumah kosong yang tak pernah terpecahkan', niche: 'Misteri & horor', tone: 'Misterius' },
  { topic: 'Cerita singkat: surat dari masa depan', niche: 'Cerita fiksi pendek', tone: 'Misterius' },
  { topic: 'Kenapa orang susah mengaku salah', niche: 'Psikologi & fakta sosial', tone: 'Santai' },
  { topic: 'Fakta sejarah yang sengaja ditutupi', niche: 'Sejarah tersembunyi', tone: 'Misterius' },
  { topic: 'Kesalahan keuangan yang bikin orang tetap miskin', niche: 'Keuangan & investasi', tone: 'Energik & viral' },
  { topic: 'Kebiasaan kecil yang diam-diam merusak kesehatan', niche: 'Kesehatan & sains', tone: 'Santai' },
  { topic: 'Hewan dengan kemampuan bertahan hidup paling gila', niche: 'Hewan & alam liar', tone: 'Energik & viral' },
  { topic: 'Teori konspirasi yang ternyata ada benarnya', niche: 'Konspirasi & urban legend', tone: 'Dramatis' },
  { topic: 'Kebiasaan orang sukses sebelum jam 8 pagi', niche: 'Motivasi & karir', tone: 'Energik & viral' }
];

export const NICHES = [...new Set(TOPIC_BANK.map((t) => t.niche))];
export const TONES = ['Energik & viral', 'Misterius', 'Santai', 'Dramatis'];
export const THEMES = [
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'tech_dark', label: 'Tech gelap' },
  { id: 'luxury_gold', label: 'Luxury gold' },
  { id: 'gaming_emerald', label: 'Emerald' }
];

// Target durasi eksplisit (detik) yang bisa dipilih user, menimpa perkiraan otomatis
// AI berdasarkan jenis konten (fakta pendek vs cerita panjang).
export const DURATION_OPTIONS = [
  { value: 'auto', label: 'Otomatis (sesuai jenis konten)' },
  { value: 'random', label: 'Acak (beda tiap generate)' },
  { value: '30', label: '30 detik' },
  { value: '60', label: '1 menit' },
  { value: '90', label: '1,5 menit' },
  { value: '120', label: '2 menit' },
  { value: '180', label: '3 menit' },
  { value: '300', label: '5 menit' }
];

/**
 * Rentang acak (detik) untuk opsi "Acak", supaya tidak terpatok satu angka pasti tiap
 * generate. Rentang beda untuk konten narasi (cerita/misteri, butuh napas lebih panjang)
 * vs fakta singkat — mengikuti pembagian yang sama dengan mode "Otomatis" di aiService.js.
 */
function randomDurationFor(niche) {
  const isNarrative = /fiksi|cerita|misteri|horor|konspirasi/i.test(niche || '');
  const [min, max] = isNarrative ? [120, 360] : [30, 150];
  return Math.floor(min + Math.random() * (max - min));
}

// Perkiraan lama proses (detik) untuk mengatur laju bar progres per sumber video —
// dipakai App.jsx saat memanggil useProgress untuk render.
export const RENDER_PACE = { template: 25, fal_ai: 70, moneyprinter: 240 };

const randomPick = () => TOPIC_BANK[Math.floor(Math.random() * TOPIC_BANK.length)];

let listeners = new Set();
let state = {
  topic: '',
  niche: '',
  tone: '',
  themeId: 'cyberpunk',
  // Default sengaja "none" alias render saja: mengunggah ke channel YouTube asli itu langkah
  // yang tidak bisa ditarik balik, jadi harus dipilih sadar, bukan kejadian karena lupa ganti.
  privacyStatus: 'none',
  targetDuration: 'auto',
  videoProvider: 'template',

  isRandomizing: false,
  isGenerating: false,
  isRendering: false,
  isFactChecking: false,

  result: null,
  videoUrl: null,
  fallbackReason: null,
  factCheck: null,

  initialized: false
};

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function getStudioState() {
  return state;
}

export function subscribeStudio(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Dipanggil sekali dari App.jsx saat aplikasi dimuat — topik awal & provider video aktif. */
export function initStudio() {
  if (state.initialized) return;
  const pick = randomPick();
  setState({ initialized: true, topic: pick.topic, niche: pick.niche, tone: pick.tone });

  axios
    .get('/api/settings')
    .then((res) => {
      const provider = res.data?.data?.videoConfig?.provider;
      if (provider) setState({ videoProvider: provider });
    })
    .catch(() => {});
}

export const setTopic = (topic) => setState({ topic });
export const setNiche = (niche) => setState({ niche });
export const setTone = (tone) => setState({ tone });
export const setThemeId = (themeId) => setState({ themeId });
export const setPrivacyStatus = (privacyStatus) => setState({ privacyStatus });
export const setTargetDuration = (targetDuration) => setState({ targetDuration });

/** Field hasil naskah (judul/deskripsi/tag) diedit langsung di kartu hasil. */
export function patchResult(patch) {
  if (!state.result) return;
  setState({ result: { ...state.result, ...patch } });
}

export async function randomizeTopic() {
  if (state.isRandomizing) return;
  setState({ isRandomizing: true });
  try {
    const res = await axios.post('/api/ai/random-topic');
    const s = res.data?.success ? res.data.data : null;
    const pick = randomPick();
    setState({
      topic: s?.topic || pick.topic,
      niche: s?.niche || pick.niche,
      tone: s?.tone || pick.tone
    });
  } catch (error) {
    const pick = randomPick();
    setState({ topic: pick.topic, niche: pick.niche, tone: pick.tone });
  } finally {
    setState({ isRandomizing: false });
  }
}

// Hanya menghasilkan naskah & metadata. Render dan upload adalah langkah terpisah,
// supaya user yang menentukan kapan video benar-benar dibuat.
export async function generateScript() {
  if (state.isGenerating || !state.topic.trim()) return;
  setState({ isGenerating: true, videoUrl: null, fallbackReason: null, factCheck: null });
  try {
    let targetDurationSeconds;
    if (state.targetDuration === 'auto') {
      targetDurationSeconds = undefined;
    } else if (state.targetDuration === 'random') {
      targetDurationSeconds = randomDurationFor(state.niche);
    } else {
      targetDurationSeconds = Number(state.targetDuration);
    }
    const res = await axios.post('/api/ai/generate', {
      topic: state.topic,
      niche: state.niche,
      tone: state.tone,
      targetDurationSeconds
    });
    if (res.data?.success) setState({ result: res.data.data });
  } catch (error) {
    toast.error('Gagal generate naskah. Pastikan server backend berjalan.');
  } finally {
    setState({ isGenerating: false });
  }
}

export async function renderAndUpload(onShortCreated) {
  if (!state.result || state.isRendering) return;
  setState({ isRendering: true });
  try {
    const res = await axios.post('/api/shorts/create-and-upload', {
      topic: state.topic,
      niche: state.niche,
      title: state.result.title,
      description: state.result.description,
      tags: state.result.tags,
      narration: state.result.narration,
      scenes: state.result.scenes,
      durationSeconds: state.result.durationSeconds,
      themeId: state.themeId,
      privacyStatus: state.privacyStatus
    });

    if (res.data?.success) {
      const data = res.data.data;
      setState({
        videoUrl: data.renderedVideo?.videoUrl || data.uploadResult?.localVideoUrl || null,
        fallbackReason: data.renderedVideo?.aiVideoFallbackReason || null
      });
      if (onShortCreated) onShortCreated(data);
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal merender video.');
  } finally {
    setState({ isRendering: false });
  }
}

// Cek fakta memakai model AI yang sama untuk menilai klaim di naskah — bukan pencarian
// internet sungguhan, jadi hasilnya saringan awal, bukan sumber kebenaran akhir
// (disclaimer ini ditampilkan juga di UI, lihat ShortsStudioView).
export async function factCheckScript() {
  if (!state.result?.narration || state.isFactChecking) return;
  setState({ isFactChecking: true });
  try {
    const res = await axios.post('/api/ai/fact-check', {
      narration: state.result.narration,
      topic: state.topic
    });
    if (res.data?.success) setState({ factCheck: res.data.data });
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal menjalankan cek fakta.');
  } finally {
    setState({ isFactChecking: false });
  }
}
