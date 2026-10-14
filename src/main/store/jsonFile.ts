// Atomic JSON persistence for small app data files (backups, settings, games).
// Writes go to "<file>.tmp" and are renamed over the target, so a crash mid-write
// never leaves a truncated file. Writes to the same file are serialized.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { z } from 'zod'
import { createLogger } from '../log'

const log = createLogger('store')
const writeChains = new Map<string, Promise<void>>()

/**
 * Reads and validates a JSON file. Returns `fallback` when the file does not exist.
 * A file that exists but is corrupt or fails validation is moved aside to
 * "<file>.corrupt-<timestamp>" (never deleted) and `fallback` is returned.
 */
export async function readJsonFile<S extends z.ZodType>(file: string, schema: S, fallback: z.infer<S>): Promise<z.infer<S>> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if (isNotFound(err)) return fallback
    throw err
  }
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^﻿/, ''))
  } catch (err) {
    await quarantine(file, err)
    return fallback
  }
  const parsed = schema.safeParse(json)
  if (parsed.success) return parsed.data
  await quarantine(file, parsed.error)
  return fallback
}

export function writeJsonFileAtomic(file: string, value: unknown): Promise<void> {
  const previous = writeChains.get(file) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => doWrite(file, value))
  writeChains.set(file, next)
  return next.finally(() => {
    if (writeChains.get(file) === next) writeChains.delete(file)
  })
}

async function doWrite(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  const body = `${JSON.stringify(value, null, 2)}\n`
  try {
    await writeFile(tmp, body, { encoding: 'utf8', flush: true })
    await rename(tmp, file)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

async function quarantine(file: string, reason: unknown): Promise<void> {
  const target = `${file}.corrupt-${Date.now()}`
  log.warn(`invalid data file ${file}; moving it to ${target}`, reason)
  try {
    await rename(file, target)
  } catch (err) {
    log.error(`could not move invalid data file ${file}`, err)
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT'
}
