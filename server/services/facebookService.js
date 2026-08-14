import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRAPH_API_VERSION = 'v21.0';

/**
 * Upload video ke Facebook Page lewat Graph API. Beda dari YouTube (OAuth authorization-code
 * flow lengkap dengan redirect & refresh token), Facebook Page pakai model yang lebih
 * sederhana: user generate PAGE ACCESS TOKEN sendiri dari Meta for Developers (App miliknya
 * sendiri, admin Page-nya sendiri), lalu tempel token itu langsung di sini — tidak ada redirect
 * OAuth di aplikasi ini. Token Page yang sudah "never expire" (dari long-lived token exchange)
 * bisa dipakai terus tanpa perlu refresh berkala seperti access token YouTube.
 *
 * Video vertikal (9:16) durasi pendek yang diupload lewat endpoint /{page-id}/videos otomatis
 * ikut disurface di tab Reels Facebook (Meta menggabungkan distribusi video pendek ke Reels
 * berdasar aspek rasio & durasi, bukan lewat endpoint terpisah) — jadi endpoint standar ini
 * sudah cukup, tidak perlu API Reels khusus yang jauh lebih rumit (upload session multi-step).
 */
class FacebookService {
  constructor() {
    const saved = dbService.getFacebookConfig() || {};
    this.pageId = saved.pageId || '';
    this.pageAccessToken = saved.pageAccessToken || '';
    this.pageName = saved.pageName || 'AI Shorts Studio Page';
    this.mode = saved.mode || 'SANDBOX';
  }

  /** Page ID & Access Token didapat user sendiri dari Meta for Developers (lihat README). */
  updateCredentials({ pageId, pageAccessToken, pageName }) {
    if (pageId !== undefined) this.pageId = pageId;
    if (pageAccessToken !== undefined) this.pageAccessToken = pageAccessToken;
    if (pageName !== undefined && pageName) this.pageName = pageName;
    this.mode = (this.pageId && this.pageAccessToken) ? 'PRODUCTION' : 'SANDBOX';
    this.persist();
  }

  persist() {
    dbService.saveFacebookConfig({
      pageId: this.pageId,
      pageAccessToken: this.pageAccessToken,
      pageName: this.pageName,
      mode: this.mode
    });
  }

  disconnect() {
    this.pageAccessToken = '';
    this.mode = 'SANDBOX';
    this.persist();
  }

  get isConnected() {
    return Boolean(this.pageId && this.pageAccessToken);
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      mode: this.mode,
      pageName: this.pageName,
      pageId: this.pageId ? `${this.pageId.slice(0, 4)}...${this.pageId.slice(-4)}` : ''
    };
  }

  /** Verifikasi cepat token+page masih valid, dipakai tombol "Cek koneksi" di Pengaturan. */
  async verifyConnection() {
    if (!this.isConnected) return { alive: false, message: 'Page ID / Access Token belum diisi.' };
    try {
      const res = await axios.get(`https://graph.facebook.com/${GRAPH_API_VERSION}/${this.pageId}`, {
        params: { fields: 'name', access_token: this.pageAccessToken },
        timeout: 10000
      });
      if (res.data?.name) this.pageName = res.data.name;
      this.persist();
      return { alive: true, pageName: res.data?.name };
    } catch (error) {
      return { alive: false, message: this.describeUploadError(error.response?.data, error.message) };
    }
  }

  buildCaption({ title, description, tags }) {
    const tagArray = typeof tags === 'string' ? tags.split(',').map((t) => t.trim()).filter(Boolean) : (tags || []);
    const hashtags = tagArray
      .slice(0, 10)
      .map((t) => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((t) => t.length > 1)
      .join(' ');
    return [title, description, hashtags].filter(Boolean).join('\n\n').slice(0, 4000);
  }

  /**
   * Upload video ke Facebook Page. Kalau Page belum terhubung, kembalikan hasil simulasi
   * (Sandbox Mode) — pola sama seperti youtubeService, supaya alur Studio/scheduler tetap
   * bisa dicoba tanpa Page Facebook asli.
   */
  async uploadShort({ title, description, tags, privacyStatus = 'public', videoData }) {
    const caption = this.buildCaption({ title, description, tags });
    const tagArray = typeof tags === 'string' ? tags.split(',').map((t) => t.trim()).filter(Boolean) : (tags || []);

    if (this.mode === 'PRODUCTION' && this.isConnected && videoData?.videoFilename) {
      try {
        return await this.realUpload({ title, description, tags: tagArray, caption, privacyStatus, videoData });
      } catch (error) {
        const detail = error.response?.data;
        console.error('Upload asli ke Facebook gagal:', detail || error.message);
        // Sama seperti youtubeService: kalau sudah tersambung tapi upload gagal, jangan
        // pura-pura berhasil — videonya tetap ada lokal, kerja render tidak terbuang.
        return {
          success: false,
          videoId: null,
          facebookVideoUrl: null,
          localVideoUrl: videoData?.videoUrl || null,
          localDownloadUrl: videoData?.downloadUrl || null,
          title,
          description,
          tags: tagArray,
          privacyStatus,
          uploadedAt: null,
          pageName: this.pageName,
          uploadMode: 'GAGAL — video tersimpan lokal, belum masuk Facebook',
          error: this.describeUploadError(detail, error.message)
        };
      }
    }

    const simulatedVideoId = 'fb_' + Math.random().toString(36).substring(2, 11);
    return {
      success: true,
      videoId: simulatedVideoId,
      facebookVideoUrl: `https://www.facebook.com/${this.pageId || 'halaman-anda'}/videos/${simulatedVideoId}`,
      localVideoUrl: videoData?.videoUrl || null,
      localDownloadUrl: videoData?.downloadUrl || null,
      title,
      description,
      tags: tagArray,
      privacyStatus,
      uploadedAt: new Date().toISOString(),
      pageName: this.pageName,
      uploadMode: this.isConnected
        ? 'Simulated (upload asli gagal — cek log server)'
        : 'Sandbox Simulated Upload (Hubungkan Page Facebook di tab Pengaturan untuk upload asli)'
    };
  }

  /**
   * Terjemahkan error mentah Graph API jadi kalimat actionable — pesan asli Facebook (mis.
   * "Error validating access token") sering tidak cukup jelas soal apa yang harus dilakukan.
   */
  describeUploadError(detail, fallbackMessage) {
    const fbError = detail?.error;
    const code = fbError?.code;
    if (code === 190) {
      return 'Page Access Token sudah tidak valid/kedaluwarsa (kode 190). Generate token baru di Meta for Developers, lalu simpan ulang di tab Pengaturan.';
    }
    if (code === 200 || fbError?.type === 'OAuthException') {
      return 'Token tidak punya izin upload video ke Page ini. Pastikan izin pages_manage_posts & pages_read_engagement sudah diberikan saat generate token.';
    }
    if (code === 10 || code === 803) {
      return 'Page ID tidak ditemukan atau token ini bukan Page Access Token untuk Page tersebut. Cek ulang Page ID & token-nya.';
    }
    return fbError?.message || fallbackMessage || 'Penyebab tidak diketahui.';
  }

  /** Upload sungguhan ke Facebook Page lewat Graph API (multipart, single request). */
  async realUpload({ title, description, tags, caption, privacyStatus, videoData }) {
    const videoPath = path.join(__dirname, '../../public/videos', videoData.videoFilename);
    if (!fs.existsSync(videoPath)) throw new Error(`File video tidak ditemukan: ${videoData.videoFilename}`);

    const form = new FormData();
    form.append('access_token', this.pageAccessToken);
    form.append('description', caption);
    // Facebook Page video tidak punya privasi granular seperti YouTube (private/unlisted) —
    // yang ada cuma published (langsung tayang) vs unpublished (draft, tayang manual nanti
    // dari Meta Business Suite). Studio memetakan pilihan "Draft" ke unpublished di sini.
    form.append('published', privacyStatus === 'draft' ? 'false' : 'true');
    form.append('source', fs.createReadStream(videoPath));

    // Endpoint upload video Facebook pakai subdomain graph-video (bukan graph biasa) —
    // dioptimalkan buat transfer file besar.
    const uploadRes = await axios.post(
      `https://graph-video.facebook.com/${GRAPH_API_VERSION}/${this.pageId}/videos`,
      form,
      {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 180000
      }
    );

    const videoId = uploadRes.data?.id;
    if (!videoId) {
      throw new Error(`Facebook tidak mengembalikan video ID. Respons: ${JSON.stringify(uploadRes.data).slice(0, 300)}`);
    }

    return {
      success: true,
      videoId,
      facebookVideoUrl: `https://www.facebook.com/${this.pageId}/videos/${videoId}`,
      localVideoUrl: videoData?.videoUrl || null,
      localDownloadUrl: videoData?.downloadUrl || null,
      title,
      description,
      tags,
      privacyStatus,
      uploadedAt: new Date().toISOString(),
      pageName: this.pageName,
      uploadMode: 'Production Live Upload (Facebook Graph API)'
    };
  }
}

export default new FacebookService();
