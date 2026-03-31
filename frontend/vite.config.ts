import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __GIT_COMMIT__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'dev').slice(0, 7)
    ),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
