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

// Topik dari riwayat (sudah pernah benar-benar digenerate) — dipakai supaya bank topik
// cadangan tidak mengusulkan ulang topik yang sudah dipakai. TOPIC_BANK cuma 10 entri tetap,
// tanpa ini bisa gampang kepilih ulang persis sama (pernah kejadian: "Misteri rumah kosong
// yang tak pernah terpecahkan" muncul lagi padahal videonya sudah ada di Riwayat).
let usedTopicsCache = new Set();

async function refreshUsedTopics() {
  try {
    const res = await axios.get('/api/shorts');
    if (res.data?.success) {
      usedTopicsCache = new Set(
        res.data.data.map((s) => (s.topic || '').trim().toLowerCase()).filter(Boolean)
      );
    }
  } catch {
    // Non-fatal — kalau gagal, cadangan tetap jalan tanpa dedup (perilaku lama).
  }
}

/** Pilih dari TOPIC_BANK yang topiknya belum pernah dipakai di Riwayat. Kalau semua sudah
 * pernah dipakai (bank-nya cuma 10 entri), pasrah pilih dari bank penuh — repeat sesekali
 * lebih baik daripada macet karena tidak ada kandidat sama sekali. */
function pickUnusedTopic() {
  const unused = TOPIC_BANK.filter((t) => !usedTopicsCache.has(t.topic.trim().toLowerCase()));
  const pool = unused.length > 0 ? unused : TOPIC_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

let listeners = new Set();
let state = {
  topic: '',
  niche: '',
  tone: '',
  themeId: 'cyberpunk',
  // Default sengaja "none" alias render saja: mengunggah ke Facebook Page asli itu langkah
  // yang tidak bisa ditarik balik, jadi harus dipilih sadar, bukan kejadian karena lupa ganti.
  privacyStatus: 'none',
  targetDuration: 'auto',
  videoProvider: 'template',

  // Footage sendiri (mode MoneyPrinterTurbo) — dipakai buat topik yang menampilkan orang/momen
  // spesifik yang memang tidak akan pernah ada di stok Pexels/Pixabay. Nonaktif secara default,
  // butuh user aktif memilih footage-nya sendiri per generate.
  useLocalFootage: false,
  footageLibrary: [], // semua klip yang pernah di-upload, dari server
  selectedFootage: [], // array filename, urutannya = urutan tempel ke timeline
  isFootageBusy: false, // upload/hapus lagi jalan

  isRandomizing: false,
  isTrending: false,
  isGenerating: false,
  isRendering: false,
  isFactChecking: false,
  isFixingNarration: false,

  result: null,
  videoUrl: null,
  fallbackReason: null,
  factCheck: null,

  // Konten bersambung (Part 2, 3, ...) — diisi lewat startContinuation() dari tombol "Buat Part
  // lanjutan" di Riwayat. Kalau ada, generateScript() mengirim ini ke server supaya naskah yang
  // dibuat benar-benar melanjutkan cerita/pembahasan sebelumnya (lihat continuationBlock di
  // aiService.js), dan renderAndUpload() menempelkan nomor part + seriesRootId ke record baru.
  continuationContext: null,

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
export async function initStudio() {
  if (state.initialized) return;
  setState({ initialized: true });

  await refreshUsedTopics();
  const pick = pickUnusedTopic();
  setState({ topic: pick.topic, niche: pick.niche, tone: pick.tone });

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

// ---------------- Footage sendiri (MoneyPrinterTurbo, video_source: 'local') ----------------

export function setUseLocalFootage(useLocalFootage) {
  setState({ useLocalFootage });
  if (useLocalFootage && state.footageLibrary.length === 0) fetchFootageLibrary();
}

export async function fetchFootageLibrary() {
  try {
    const res = await axios.get('/api/footage');
    if (res.data?.success) {
      const clips = res.data.data.clips || [];
      setState({
        footageLibrary: clips,
        // Buang pilihan yang filenya sudah tidak ada lagi (mis. dihapus manual)
        selectedFootage: state.selectedFootage.filter((f) => clips.some((c) => c.filename === f))
      });
      if (res.data.data.installed === false) {
        toast.error('MoneyPrinterTurbo belum ter-install. Jalankan start-moneyprinter.bat dulu.');
      }
    }
  } catch (error) {
    toast.error('Gagal memuat daftar footage.');
  }
}

export async function uploadFootageFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  setState({ isFootageBusy: true });
  try {
    const form = new FormData();
    Array.from(fileList).forEach((file) => form.append('clips', file));
    const res = await axios.post('/api/footage/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (res.data?.success) {
      const { uploaded, clips } = res.data.data;
      // Klip yang baru saja diupload langsung dicentang & ditaruh di urutan paling akhir,
      // supaya user tidak perlu klik ulang satu-satu setelah upload.
      setState({
        footageLibrary: clips,
        selectedFootage: [...state.selectedFootage, ...uploaded]
      });
      toast.success(`${uploaded.length} footage berhasil diupload.`, { duration: 3000 });
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal upload footage.');
  } finally {
    setState({ isFootageBusy: false });
  }
}

export async function deleteFootageClip(filename) {
  setState({ isFootageBusy: true });
  try {
    const res = await axios.delete(`/api/footage/${encodeURIComponent(filename)}`);
    if (res.data?.success) {
      setState({
        footageLibrary: res.data.data,
        selectedFootage: state.selectedFootage.filter((f) => f !== filename)
      });
      toast.success('Footage dihapus.', { duration: 2000 });
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal menghapus footage.');
  } finally {
    setState({ isFootageBusy: false });
  }
}

export function toggleFootageSelected(filename) {
  const selected = state.selectedFootage.includes(filename)
    ? state.selectedFootage.filter((f) => f !== filename)
    : [...state.selectedFootage, filename];
  setState({ selectedFootage: selected });
}

/** Geser urutan klip terpilih — urutannya menentukan urutan tempel ke timeline video. */
export function moveFootageSelected(filename, direction) {
  const list = [...state.selectedFootage];
  const idx = list.indexOf(filename);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= list.length) return;
  [list[idx], list[target]] = [list[target], list[idx]];
  setState({ selectedFootage: list });
}

/** Field hasil naskah (judul/deskripsi/tag) diedit langsung di kartu hasil. */
export function patchResult(patch) {
  if (!state.result) return;
  setState({ result: { ...state.result, ...patch } });
}

export async function randomizeTopic() {
  if (state.isRandomizing) return;
  // Topik acak = user mau ide baru yang lepas dari konteks apapun, jadi lanjutan yang lagi
  // disiapkan (kalau ada) dibatalkan supaya tidak nyangkut jadi "Part N" dari topik yang
  // sudah tidak relevan lagi.
  setState({ isRandomizing: true, continuationContext: null });
  try {
    const res = await axios.post('/api/ai/random-topic');
    const s = res.data?.success ? res.data.data : null;
    if (s?.topic) {
      setState({ topic: s.topic, niche: s.niche, tone: s.tone });
    } else {
      // usedTopicsCache cuma di-refresh sekali saat app dimuat — refresh lagi di sini (bukan di
      // jalur sukses di atas) supaya short yang baru dibuat di sesi ini ikut ke-exclude, tanpa
      // menambah latensi ke jalur AI yang normalnya berhasil.
      await refreshUsedTopics();
      const pick = pickUnusedTopic();
      setState({ topic: pick.topic, niche: pick.niche, tone: pick.tone });
    }
  } catch (error) {
    await refreshUsedTopics();
    const pick = pickUnusedTopic();
    setState({ topic: pick.topic, niche: pick.niche, tone: pick.tone });
  } finally {
    setState({ isRandomizing: false });
  }
}

/**
 * Ambil topik yang lagi rame dicari orang Indonesia hari ini (Google Trends), lalu minta AI
 * susun jadi angle video Shorts — beda dari randomizeTopic yang tebakan/bank lokal, ini
 * berangkat dari data tren sungguhan supaya peluang viral lebih besar.
 */
export async function trendingTopic() {
  if (state.isTrending) return;
  setState({ isTrending: true, continuationContext: null });
  try {
    const res = await axios.post('/api/ai/trending-topic');
    const s = res.data?.success ? res.data.data : null;
    if (s?.topic) {
      setState({ topic: s.topic, niche: s.niche || state.niche, tone: s.tone || state.tone });
      toast(s.sourceTrend ? `Berangkat dari tren: "${s.sourceTrend}"` : 'Topik trending diambil.', {
        title: 'Ide dari trending',
        type: 'info',
        duration: 4000
      });
    } else {
      toast.error('Gagal mengambil topik trending, coba lagi.');
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal mengambil topik trending.');
  } finally {
    setState({ isTrending: false });
  }
}

/** Siapkan Studio buat generate naskah lanjutan (Part N) dari sebuah video di Riwayat. */
export function startContinuation(previousRecord) {
  setState({
    topic: previousRecord.topic || previousRecord.title,
    niche: previousRecord.niche || state.niche,
    result: null,
    videoUrl: null,
    fallbackReason: null,
    factCheck: null,
    continuationContext: {
      partNumber: (previousRecord.seriesPartNumber || 1) + 1,
      previousTitle: previousRecord.title,
      previousNarration: previousRecord.narration,
      seriesRootId: previousRecord.seriesRootId || previousRecord.id
    }
  });
}

export function clearContinuation() {
  setState({ continuationContext: null });
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
      targetDurationSeconds,
      continuationContext: state.continuationContext
        ? {
            partNumber: state.continuationContext.partNumber,
            previousTitle: state.continuationContext.previousTitle,
            previousNarration: state.continuationContext.previousNarration
          }
        : undefined
    });
    if (res.data?.success) {
      setState({ result: res.data.data });
      toast.success('Naskah, judul, dan tag siap direview di bawah.', {
        title: 'Naskah selesai dibuat',
        duration: 3500
      });
    }
  } catch (error) {
    toast.error('Gagal generate naskah. Pastikan server backend berjalan.');
  } finally {
    setState({ isGenerating: false });
  }
}

export async function renderAndUpload(onShortCreated) {
  if (!state.result || state.isRendering) return;
  // Footage sendiri cuma relevan kalau mode video-nya MoneyPrinterTurbo DAN togelnya aktif
  // DAN memang ada klip yang dipilih — kalau tidak, kirim kosong supaya server jatuh ke
  // pencarian stok otomatis seperti biasa.
  const useFootage = state.useLocalFootage && state.videoProvider === 'moneyprinter' && state.selectedFootage.length > 0;
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
      privacyStatus: state.privacyStatus,
      localFootage: useFootage ? state.selectedFootage : undefined,
      seriesPartNumber: state.continuationContext?.partNumber || 1,
      seriesRootId: state.continuationContext?.seriesRootId || undefined
    });

    if (res.data?.success) {
      const data = res.data.data;
      setState({
        videoUrl: data.renderedVideo?.videoUrl || data.uploadResult?.localVideoUrl || null,
        fallbackReason: data.renderedVideo?.aiVideoFallbackReason || null,
        // Part ini sudah selesai dibuat — lanjutan berikutnya (kalau mau) diminta lewat tombol
        // "Buat Part lanjutan" lagi dari item baru ini di Riwayat, bukan otomatis nge-chain.
        continuationContext: null
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
    if (res.data?.success) {
      setState({ factCheck: res.data.data });
      const problemCount = (res.data.data.claims || []).filter(
        (c) => c.verdict === 'meragukan' || c.verdict === 'keliru'
      ).length;
      toast(problemCount > 0
        ? `${problemCount} klaim perlu diperiksa lagi — lihat detail di bawah.`
        : 'Tidak ada klaim bermasalah yang terdeteksi.', {
        title: 'Cek fakta selesai',
        type: problemCount > 0 ? 'info' : 'success',
        duration: 4000
      });
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal menjalankan cek fakta.');
  } finally {
    setState({ isFactChecking: false });
  }
}

/** Klaim yang perlu diperbaiki dari hasil cek fakta terakhir — dipakai untuk menampilkan
 * tombol "Perbaiki sesuai fakta" hanya kalau memang ada yang perlu diperbaiki. */
export function getProblemClaims() {
  return (state.factCheck?.claims || []).filter((c) => c.verdict === 'meragukan' || c.verdict === 'keliru');
}

// Kirim naskah + klaim bermasalah ke AI, minta direvisi HANYA bagian yang bermasalah
// (gaya bahasa, urutan, jumlah scene dipertahankan). Hasil cek fakta lama dibuang karena
// sudah tidak relevan dengan naskah yang baru — user perlu klik "Cek fakta" lagi kalau mau
// memastikan hasil revisinya sudah bersih, bukan diklaim otomatis "sudah benar" tanpa dicek ulang.
export async function applyFactCheckFixes() {
  const problemClaims = getProblemClaims();
  if (!state.result || problemClaims.length === 0 || state.isFixingNarration) return;
  setState({ isFixingNarration: true });
  try {
    const res = await axios.post('/api/ai/fix-narration', {
      title: state.result.title,
      description: state.result.description,
      tags: state.result.tags,
      narration: state.result.narration,
      durationSeconds: state.result.durationSeconds,
      scenes: state.result.scenes,
      claims: problemClaims,
      topic: state.topic
    });
    if (res.data?.success) {
      setState({ result: res.data.data, factCheck: null, videoUrl: null, fallbackReason: null });
      toast.success('Naskah diperbarui sesuai hasil cek fakta. Cek fakta lagi kalau mau memastikan.', { duration: 5000 });
    }
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal memperbaiki naskah.');
  } finally {
    setState({ isFixingNarration: false });
  }
}
