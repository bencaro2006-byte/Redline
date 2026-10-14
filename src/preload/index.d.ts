import type { RedlineApi } from '../shared/api'

declare global {
  interface Window {
    /** Present in Electron; undefined when the renderer runs in a plain browser (npm run dev:web). */
    redline: RedlineApi
  }
}

export {}
