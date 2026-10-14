import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { target: 'node24' },
  },
  preload: {
    resolve: { alias: shared },
    build: { target: 'node24' },
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
    build: { target: 'chrome152', minify: true },
  },
})
