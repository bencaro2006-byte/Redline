// Browser-only dev server for the renderer. window.redline is undefined here,
// so the renderer falls back to the mock API in src/renderer/src/mock/.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  plugins: [react()],
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
})
