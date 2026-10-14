// Live metrics subscription over IPC events. The preload ref-counts renderer
// callbacks and sends one subscribe / unsubscribe per webContents; main keeps one
// monitor listener per subscribed webContents and drops it when that webContents dies.
import { ipcMain, type WebContents } from 'electron'
import { IPC_EVENTS } from '@shared/api'
import type { LiveMetrics } from '@shared/types'
import { createLogger } from '../log'
import { addMetricsListener } from '../monitor'
import { toErrorBody } from './errors'
import { isTrustedSender } from './handle'

const log = createLogger('ipc-metrics')
const subscriptions = new Map<number, () => void>()

function unsubscribe(webContentsId: number): void {
  const stop = subscriptions.get(webContentsId)
  if (stop === undefined) return
  subscriptions.delete(webContentsId)
  try {
    stop()
  } catch (err) {
    log.error('metrics unsubscribe failed', err)
  }
}

function subscribe(sender: WebContents): void {
  if (subscriptions.has(sender.id)) return
  const send = (metrics: LiveMetrics): void => {
    if (!sender.isDestroyed()) sender.send(IPC_EVENTS.metrics, metrics)
  }
  try {
    subscriptions.set(sender.id, addMetricsListener(send))
  } catch (err) {
    const body = toErrorBody(err)
    if (body.code === 'NOT_IMPLEMENTED') log.warn('metrics: not implemented')
    else log.error('metrics subscribe failed', err)
    return
  }
  const id = sender.id
  sender.once('destroyed', () => unsubscribe(id))
}

export function registerMetricsIpc(): void {
  ipcMain.on(IPC_EVENTS.metricsSubscribe, (event) => {
    if (!isTrustedSender(event)) {
      log.warn('rejected metrics subscribe from untrusted sender')
      return
    }
    subscribe(event.sender)
  })
  ipcMain.on(IPC_EVENTS.metricsUnsubscribe, (event) => {
    if (!isTrustedSender(event)) return
    unsubscribe(event.sender.id)
  })
}

export function unsubscribeAllMetrics(): void {
  ;[...subscriptions.keys()].forEach(unsubscribe)
}
