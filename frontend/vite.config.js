import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API in development, exactly like on Vercel (/api → backend service).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
