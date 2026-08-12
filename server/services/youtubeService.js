import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Redirect URI ini HARUS didaftarkan persis sama di Google Cloud Console
// (OAuth Client > Authorized redirect URIs). Bisa dioverride via .env kalau
// app dijalankan di domain/port lain.
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'http://localhost:5173/api/youtube/oauth/callback';
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
].join(' ');

class YouTubeService {
  constructor() {
    const saved = dbService.getYouTubeConfig() || {};
    this.clientId = saved.clientId || '';
    this.clientSecret = saved.clientSecret || '';
    this.accessToken = saved.accessToken || '';
    this.refreshToken = saved.refreshToken || '';
    this.tokenExpiresAt = saved.tokenExpiresAt || 0;
    this.channelId = saved.channelId || '';
    this.channelName = saved.channelName || 'AI Shorts Studio Channel';
    this.subscriberCount = saved.subscriberCount || '';
    this.mode = saved.mode || 'SANDBOX';
  }

  /** Update kredensial dasar (client ID/secret/nama channel) dari form Pengaturan */
  updateCredentials({ clientId, clientSecret, channelName }) {
    if (clientId !== undefined) this.clientId = clientId;
    if (clientSecret !== undefined) this.clientSecret = clientSecret;
    if (channelName) this.channelName = channelName;
    this.persist();
  }

  persist() {
    dbService.saveYouTubeConfig({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiresAt: this.tokenExpiresAt,
      channelId: this.channelId,
      channelName: this.channelName,
      subscriberCount: this.subscriberCount,
      mode: this.mode
    });
  }

  get isOAuthConnected() {
    return Boolean(this.refreshToken);
  }

  getStatus() {
    return {
      // Hanya true kalau OAuth benar-benar tersambung — mode SANDBOX berarti upload disimulasikan.
      isConnected: this.isOAuthConnected,
      isOAuthConnected: this.isOAuthConnected,
      mode: this.mode,
      channelName: this.channelName,
      subscriberCount: this.subscriberCount || '',
      hasOAuthCredentials: Boolean(this.clientId && this.clientSecret),
      redirectUri: REDIRECT_URI
    };
  }

  /** Bangun URL consent screen Google untuk memulai alur OAuth */
  getAuthUrl() {
    if (!this.clientId) {
      throw new Error('Google Client ID belum diatur. Isi & simpan dulu di tab Pengaturan.');
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: OAUTH_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Tukar authorization code dengan access & refresh token, lalu ambil info channel */
  async handleOAuthCallback(code) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Client ID/Secret belum diatur di Pengaturan.');
    }

    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    this.accessToken = access_token;
    // Google hanya mengirim refresh_token pada consent pertama kali
    // (atau saat prompt=consent dipaksa, seperti di atas)
    if (refresh_token) this.refreshToken = refresh_token;
    this.tokenExpiresAt = Date.now() + (expires_in * 1000) - 60000;
    this.mode = 'PRODUCTION';

    try {
      const chRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'snippet,statistics', mine: true },
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      const channel = chRes.data?.items?.[0];
      if (channel) {
        this.channelId = channel.id;
        this.channelName = channel.snippet?.title || this.channelName;
        this.subscriberCount = channel.statistics?.subscriberCount || this.subscriberCount;
      }
    } catch (err) {
      console.warn('Gagal mengambil info channel YouTube setelah OAuth:', err.response?.data || err.message);
    }

    this.persist();
    return { channelName: this.channelName };
  }

  disconnect() {
    this.accessToken = '';
    this.refreshToken = '';
    this.tokenExpiresAt = 0;
    this.channelId = '';
    this.mode = 'SANDBOX';
    this.persist();
  }

  /** Pastikan access token masih berlaku, refresh kalau sudah/hampir kedaluwarsa */
  async ensureValidAccessToken() {
    if (!this.refreshToken) {
      throw new Error('YouTube belum terhubung via OAuth. Klik "Hubungkan dengan Google" di Pengaturan.');
    }
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    this.accessToken = tokenRes.data.access_token;
    this.tokenExpiresAt = Date.now() + (tokenRes.data.expires_in * 1000) - 60000;
    this.persist();
    return this.accessToken;
  }

  /**
   * Upload video vertikal ke YouTube Shorts.
   * Kalau sudah terhubung OAuth & mode PRODUCTION, lakukan resumable upload
   * sungguhan lewat YouTube Data API v3. Kalau tidak, kembalikan hasil
   * simulasi (Sandbox Mode) supaya alur studio tetap bisa dicoba tanpa akun YouTube asli.
   */
  async uploadShort({ title, description, tags, privacyStatus = 'public', videoData }) {
    const tagArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : (tags || []);

    if (this.mode === 'PRODUCTION' && this.isOAuthConnected && videoData?.videoFilename) {
      try {
        return await this.realUpload({ title, description, tags: tagArray, privacyStatus, videoData });
      } catch (error) {
        const detail = error.response?.data;
        console.error('Upload asli ke YouTube gagal:', detail || error.message);

        // Akun SUDAH tersambung tapi upload gagal — jangan pura-pura berhasil. Dulu kasus ini
        // ikut jatuh ke hasil simulasi, sehingga riwayat mencatat "berhasil" lengkap dengan
        // link YouTube palsu yang kalau diklik cuma menuju video yang tidak ada.
        // Videonya sendiri tetap ada di lokal, jadi kerja render tidak terbuang.
        return {
          success: false,
          videoId: null,
          youtubeShortsUrl: null,
          localVideoUrl: videoData?.videoUrl || null,
          localDownloadUrl: videoData?.downloadUrl || null,
          title,
          description,
          tags: tagArray,
          privacyStatus,
          uploadedAt: null,
          channelName: this.channelName,
          uploadMode: 'GAGAL — video tersimpan lokal, belum masuk YouTube',
          error: this.describeUploadError(detail, error.message)
        };
      }
    }

    const simulatedVideoId = 'yt_' + Math.random().toString(36).substring(2, 11);
    return {
      success: true,
      videoId: simulatedVideoId,
      youtubeShortsUrl: `https://www.youtube.com/shorts/${simulatedVideoId}`,
      localVideoUrl: videoData?.videoUrl || null,
      localDownloadUrl: videoData?.downloadUrl || null,
      title,
      description,
      tags: tagArray,
      privacyStatus,
      uploadedAt: new Date().toISOString(),
      channelName: this.channelName,
      uploadMode: this.isOAuthConnected
        ? 'Simulated (upload asli gagal — cek log server)'
        : 'Sandbox Simulated Upload (Hubungkan dengan Google di tab Pengaturan untuk upload asli)'
    };
  }

  /**
   * Terjemahkan error mentah Google jadi kalimat yang langsung memberi tahu apa yang harus
   * dilakukan. "invalid_grant" paling sering muncul dan pesan aslinya cuma "Bad Request",
   * yang sama sekali tidak memberi petunjuk.
   */
  describeUploadError(detail, fallbackMessage) {
    const kode = detail?.error?.errors?.[0]?.reason || detail?.error || '';
    const pesanGoogle = detail?.error?.message || detail?.error_description || '';

    if (kode === 'invalid_grant') {
      return 'Izin Google sudah tidak berlaku (invalid_grant). Buka tab Pengaturan lalu klik ' +
        '"Hubungkan Google" sekali lagi. Ini normal terjadi kalau OAuth consent screen masih ' +
        'berstatus Testing, karena Google membatasi masa berlaku izinnya sekitar 7 hari.';
    }
    if (kode === 'quotaExceeded' || kode === 'uploadLimitExceeded') {
      return 'Kuota upload YouTube API hari ini habis. Coba lagi besok setelah kuota direset.';
    }
    if (kode === 'forbidden' || kode === 'insufficientPermissions') {
      return 'Akun Google tersambung tapi tidak punya izin upload. Pastikan scope youtube.upload ' +
        'disetujui dan channel-nya benar, lalu hubungkan ulang.';
    }
    return pesanGoogle || fallbackMessage || 'Penyebab tidak diketahui.';
  }

  /** Resumable upload sungguhan ke YouTube Data API v3 */
  async realUpload({ title, description, tags, privacyStatus, videoData }) {
    const accessToken = await this.ensureValidAccessToken();
    const videoPath = path.join(__dirname, '../../public/videos', videoData.videoFilename);
    if (!fs.existsSync(videoPath)) throw new Error(`File video tidak ditemukan: ${videoData.videoFilename}`);
    const stat = fs.statSync(videoPath);

    // Langkah 1: buka sesi resumable upload
    const initRes = await axios.post(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        snippet: {
          title: (title || 'AI Shorts Studio').slice(0, 100),
          description: description || '',
          tags: tags.slice(0, 15),
          categoryId: '22'
        },
        status: {
          privacyStatus: privacyStatus || 'public',
          selfDeclaredMadeForKids: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(stat.size)
        }
      }
    );

    const uploadUrl = initRes.headers.location;
    if (!uploadUrl) throw new Error('YouTube tidak mengembalikan upload session URL.');

    // Langkah 2: kirim file video ke upload session URL
    const fileStream = fs.createReadStream(videoPath);
    const uploadRes = await axios.put(uploadUrl, fileStream, {
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': stat.size },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const videoId = uploadRes.data.id;
    return {
      success: true,
      videoId,
      youtubeShortsUrl: `https://www.youtube.com/shorts/${videoId}`,
      localVideoUrl: videoData?.videoUrl || null,
      localDownloadUrl: videoData?.downloadUrl || null,
      title,
      description,
      tags,
      privacyStatus,
      uploadedAt: new Date().toISOString(),
      channelName: this.channelName,
      uploadMode: 'Production Live Upload (YouTube Data API v3)'
    };
  }
}

export default new YouTubeService();
