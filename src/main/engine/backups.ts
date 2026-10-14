// Backup journal: every change records the "before" snapshot of each action so it
// can be reverted. Persisted atomically via store/jsonFile.ts; a corrupt file is moved
// aside (never deleted) and the journal starts fresh.
// Backup ids are UUIDs, which match /^[A-Za-z0-9_-]{1,64}$/ (validated at the IPC boundary).
import { randomUUID } from 'node:crypto'
import type { BackupEntry, BackupItem } from '@shared/types'
import { dataFile } from '../paths'
import { readJsonFile, writeJsonFileAtomic } from '../store/jsonFile'
import { BackupFileSchema, type BackupFile } from './schemas'

/** Oldest reverted entries are pruned beyond this many; unreverted entries are always kept. */
export const MAX_BACKUP_ENTRIES = 500

export interface NewBackup {
  kind: BackupEntry['kind']
  label: string
  tweakIds: string[]
  items: BackupItem[]
}

const EMPTY: BackupFile = { version: 1, entries: [] }

/** Drops the oldest reverted entries until the journal fits MAX_BACKUP_ENTRIES (pure). */
export function pruneEntries(entries: readonly BackupEntry[], max: number = MAX_BACKUP_ENTRIES): BackupEntry[] {
  if (entries.length <= max) return [...entries]
  const excess = entries.length - max
  const removable = new Set(
    [...entries]
      .filter((e) => e.revertedAt !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, excess)
      .map((e) => e.id),
  )
  return entries.filter((e) => !removable.has(e.id))
}

export class BackupStore {
  // Serializes read-modify-write cycles so concurrent appends never lose an entry.
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    readonly file: string,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
  ) {}

  private async read(): Promise<BackupFile> {
    return readJsonFile(this.file, BackupFileSchema, EMPTY)
  }

  private mutate<T>(fn: (current: BackupFile) => { next: BackupFile; result: T }): Promise<T> {
    const run = async (): Promise<T> => {
      const { next, result } = fn(await this.read())
      await writeJsonFileAtomic(this.file, next)
      return result
    }
    const result = this.chain.then(run, run)
    this.chain = result.catch(() => undefined)
    return result
  }

  /** Newest first. */
  async list(): Promise<BackupEntry[]> {
    await this.chain.catch(() => undefined)
    const { entries } = await this.read()
    return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(id: string): Promise<BackupEntry | undefined> {
    return (await this.list()).find((e) => e.id === id)
  }

  /** Assigns id + createdAt, persists, and returns the stored entry. */
  async append(entry: NewBackup): Promise<BackupEntry> {
    const stored: BackupEntry = {
      id: this.newId(),
      createdAt: this.now().toISOString(),
      kind: entry.kind,
      label: entry.label,
      tweakIds: [...entry.tweakIds],
      items: [...entry.items],
      revertedAt: null,
    }
    return this.mutate((current) => ({
      next: { version: 1, entries: pruneEntries([...current.entries, stored]) },
      result: stored,
    }))
  }

  /**
   * Updates an entry's items (and optionally label / tweak ids), e.g. to record the GUID of a
   * power plan created during apply or to drop items that turned out not to change anything.
   */
  async updateEntry(id: string, patch: { items: readonly BackupItem[]; tweakIds?: readonly string[]; label?: string }): Promise<BackupEntry> {
    return this.mutate((current) => {
      const entry = current.entries.find((e) => e.id === id)
      if (entry === undefined) throw new Error(`Unknown backup ${id}`)
      const updated: BackupEntry = {
        ...entry,
        items: [...patch.items],
        ...(patch.tweakIds !== undefined ? { tweakIds: [...patch.tweakIds] } : {}),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
      }
      return { next: { version: 1, entries: current.entries.map((e) => (e.id === id ? updated : e)) }, result: updated }
    })
  }

  /** Deletes an entry (used when an apply turned out to change nothing). */
  async remove(id: string): Promise<void> {
    await this.mutate((current) => ({ next: { version: 1, entries: current.entries.filter((e) => e.id !== id) }, result: undefined }))
  }

  /** Sets revertedAt (default now) and returns the updated entry. */
  async markReverted(id: string, at?: string): Promise<BackupEntry> {
    return this.mutate((current) => {
      const entry = current.entries.find((e) => e.id === id)
      if (entry === undefined) throw new Error(`Unknown backup ${id}`)
      const updated: BackupEntry = { ...entry, revertedAt: at ?? this.now().toISOString() }
      return { next: { version: 1, entries: current.entries.map((e) => (e.id === id ? updated : e)) }, result: updated }
    })
  }
}

let store: BackupStore | null = null

export function getBackupStore(): BackupStore {
  store ??= new BackupStore(dataFile('backups'))
  return store
}

export async function listBackups(): Promise<BackupEntry[]> {
  return getBackupStore().list()
}
