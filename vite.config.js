import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxyTarget = process.env.SCRIPTY_SERVER_URL ?? 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        changeOrigin: true,
        target: apiProxyTarget,
      },
    },
  },
})
