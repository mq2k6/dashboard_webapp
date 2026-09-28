import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev-time proxy so the frontend can call /api without CORS hassle.
    // In production the built frontend is served by the backend itself
    // (see README), so this only matters for `npm run dev`.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
    allowedHosts: ['sbox']
  },
})
