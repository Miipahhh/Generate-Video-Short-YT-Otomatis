import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // AI generate/render bisa butuh belasan menit (model reasoning yang lambat, render
        // MoneyPrinterTurbo). Tanpa ini, proxy dev server Vite mereset koneksi di tengah jalan
        // meski backend-nya sendiri masih memproses — request terlihat gagal padahal cuma
        // proxy-nya yang menyerah duluan.
        timeout: 0,
        proxyTimeout: 0
      }
    }
  }
})
