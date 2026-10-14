// Sandboxed preload (bundled as CommonJS). Exposes one function per capability as
// window.redline. Never exposes ipcRenderer, a generic invoke, or the IPC event object.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENTS, type RedlineApi, type TaskProgress } from '@shared/api'
import type { LiveMetrics } from '@shared/types'

// One main-side metrics subscription per page, shared by all renderer callbacks.
const metricsCallbacks = new Set<(m: LiveMetrics) => void>()

const onMetrics = (_event: IpcRendererEvent, metrics: LiveMetrics): void => {
  metricsCallbacks.forEach((cb) => cb(metrics))
}

function subscribeMetrics(cb: (m: LiveMetrics) => void): () => void {
  const wrapped = (m: LiveMetrics): void => cb(m)
  if (metricsCallbacks.size === 0) {
    ipcRenderer.on(IPC_EVENTS.metrics, onMetrics)
    ipcRenderer.send(IPC_EVENTS.metricsSubscribe)
  }
  metricsCallbacks.add(wrapped)
  let active = true
  return () => {
    if (!active) return
    active = false
    metricsCallbacks.delete(wrapped)
    if (metricsCallbacks.size === 0) {
      ipcRenderer.send(IPC_EVENTS.metricsUnsubscribe)
      ipcRenderer.removeListener(IPC_EVENTS.metrics, onMetrics)
    }
  }
}

function subscribeProgress(cb: (p: TaskProgress) => void): () => void {
  const listener = (_event: IpcRendererEvent, progress: TaskProgress): void => cb(progress)
  ipcRenderer.on(IPC_EVENTS.taskProgress, listener)
  return () => {
    ipcRenderer.removeListener(IPC_EVENTS.taskProgress, listener)
  }
}

const api: RedlineApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  getCatalog: () => ipcRenderer.invoke(IPC.getCatalog),
  scanSystem: (req) => ipcRenderer.invoke(IPC.scanSystem, req),
  detectTweaks: () => ipcRenderer.invoke(IPC.detectTweaks),
  applyTweaks: (req) => ipcRenderer.invoke(IPC.applyTweaks, req),
  listBackups: () => ipcRenderer.invoke(IPC.listBackups),
  revertBackup: (req) => ipcRenderer.invoke(IPC.revertBackup, req),
  createRestorePoint: () => ipcRenderer.invoke(IPC.createRestorePoint),
  listAppx: () => ipcRenderer.invoke(IPC.listAppx),
  removeAppx: (req) => ipcRenderer.invoke(IPC.removeAppx, req),
  listGames: () => ipcRenderer.invoke(IPC.listGames),
  addGame: () => ipcRenderer.invoke(IPC.addGame),
  updateGame: (req) => ipcRenderer.invoke(IPC.updateGame, req),
  removeGame: (req) => ipcRenderer.invoke(IPC.removeGame, req),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (req) => ipcRenderer.invoke(IPC.setSettings, req),
  openNvidiaControlPanel: () => ipcRenderer.invoke(IPC.openNvidiaControlPanel),
  onLiveMetrics: subscribeMetrics,
  onTaskProgress: subscribeProgress,
}

contextBridge.exposeInMainWorld('redline', api)
