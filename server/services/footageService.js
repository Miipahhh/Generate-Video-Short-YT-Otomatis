import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);

/**
 * Kelola footage video milik user sendiri (bukan pencarian stok Pexels/Pixabay) untuk mode
 * MoneyPrinterTurbo. File disimpan LANGSUNG di folder `local_videos` milik MoneyPrinterTurbo
 * (MoneyPrinterTurbo/storage/local_videos) — bukan folder kita sendiri — karena
 * video_source:'local' di MoneyPrinterTurbo cuma mau menerima path yang sudah divalidasi ada
 * di dalam folder itu persis (lihat file_security.resolve_path_within_directory di source
 * Python-nya, dipakai buat mencegah path traversal). Filename di folder itu jadi satu-satunya
 * "sumber kebenaran" — tidak ada database metadata terpisah supaya tidak ada resiko baris
 * metadata basi kalau file dihapus manual di luar aplikasi.
 */
class FootageService {
  constructor() {
    this.mptDir = path.join(__dirname, '../../MoneyPrinterTurbo');
    this.dir = path.join(this.mptDir, 'storage/local_videos');
    // SENGAJA TIDAK bikin folder di sini. start-moneyprinter.bat mendeteksi perlu-tidaknya
    // clone MoneyPrinterTurbo lewat "if not exist MoneyPrinterTurbo" — kalau folder itu
    // (atau folder di dalamnya) sudah kebentuk duluan dari sini sebelum user pernah
    // menjalankan start-moneyprinter.bat, git clone akan menolak (folder tujuan tidak kosong)
    // dan instalasi MoneyPrinterTurbo jadi rusak/terpotong. Folder local_videos baru dibuat
    // lazy lewat ensureDir(), dan CUMA kalau MoneyPrinterTurbo memang sudah ter-install.
  }

  /** MoneyPrinterTurbo sudah ter-clone & siap (bukan folder kosong/setengah jadi). */
  get isMoneyPrinterInstalled() {
    return fs.existsSync(path.join(this.mptDir, 'main.py'));
  }

  ensureDir() {
    if (!this.isMoneyPrinterInstalled) {
      throw new Error('MoneyPrinterTurbo belum ter-install. Jalankan start-moneyprinter.bat dulu (lihat README).');
    }
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  isAllowedExt(filename) {
    return ALLOWED_EXT.has(path.extname(filename).toLowerCase());
  }

  /** Nama file unik & aman (tanpa karakter yang bisa dipakai buat path traversal). */
  sanitizeFilename(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const base = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 60) || 'clip';
    return `${base}_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`;
  }

  list() {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => this.isAllowedExt(f))
        .map((filename) => {
          const stat = fs.statSync(path.join(this.dir, filename));
          return {
            filename,
            sizeBytes: stat.size,
            uploadedAt: stat.mtime.toISOString(),
            url: `/footage/${encodeURIComponent(filename)}`
          };
        })
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    } catch (err) {
      console.warn('[FootageService] Gagal membaca daftar footage:', err.message);
      return [];
    }
  }

  delete(filename) {
    // path.basename membuang komponen direktori apapun (mis. "../../etc/passwd" jadi
    // "passwd") — filename yang dipakai buat hapus WAJIB lewat basename dulu supaya tidak
    // bisa dipakai keluar dari folder local_videos.
    const safeName = path.basename(filename);
    const target = path.join(this.dir, safeName);
    if (!target.startsWith(this.dir)) {
      throw new Error('Nama file tidak valid.');
    }
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

export default new FootageService();
