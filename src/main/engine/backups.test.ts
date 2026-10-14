import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BackupEntry, BackupItem } from '@shared/types'
import { BackupStore, pruneEntries } from './backups'

const item: BackupItem = {
  key: 'menu#0',
  action: { type: 'registry', hive: 'HKCU', path: 'Control Panel\\Desktop', name: 'MenuShowDelay', valueType: 'REG_SZ', value: '100', default: '400' },
  before: { kind: 'registry', exists: true, valueType: 'REG_SZ', value: '400' },
}

let dir: string
let clock: number
let ids: number

const makeStore = (): BackupStore =>
  new BackupStore(
    join(dir, 'backups.json'),
    () => new Date(Date.UTC(2026, 9, 10, 12, 0, clock++)),
    () => `id-${ids++}`,
  )

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'redline-backups-'))
  clock = 0
  ids = 1
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('BackupStore', () => {
  it('starts empty when the file does not exist', async () => {
    expect(await makeStore().list()).toEqual([])
  })

  it('appends entries with ids and timestamps and lists newest first', async () => {
    const store = makeStore()
    await store.append({ kind: 'tweaks', label: 'first', tweakIds: ['menu'], items: [item] })
    await store.append({ kind: 'tweaks', label: 'second', tweakIds: ['menu'], items: [item] })
    const list = await store.list()
    expect(list.map((e) => e.label)).toEqual(['second', 'first'])
    expect(list[1]).toMatchObject({ id: 'id-1', revertedAt: null, createdAt: '2026-10-10T12:00:00.000Z' })
  })

  it('serializes concurrent appends so none is lost', async () => {
    const store = makeStore()
    await Promise.all(Array.from({ length: 8 }, (_, i) => store.append({ kind: 'tweaks', label: `e${i}`, tweakIds: [], items: [] })))
    expect((await store.list()).length).toBe(8)
  })

  it('marks an entry reverted and replaces its items', async () => {
    const store = makeStore()
    const entry = await store.append({ kind: 'tweaks', label: 'x', tweakIds: ['menu'], items: [item] })
    const changed: BackupItem = { ...item, before: { ...item.before, value: '200' } as BackupItem['before'] }
    await store.updateEntry(entry.id, { items: [changed] })
    await store.markReverted(entry.id, '2026-10-10T13:00:00.000Z')
    const stored = await store.get(entry.id)
    expect(stored?.revertedAt).toBe('2026-10-10T13:00:00.000Z')
    expect(stored?.items[0]?.before).toEqual({ kind: 'registry', exists: true, valueType: 'REG_SZ', value: '200' })
  })

  it('rejects updates to unknown entries', async () => {
    await expect(makeStore().markReverted('missing')).rejects.toThrow(/Unknown backup/)
  })

  it('moves a corrupt journal aside instead of deleting it', async () => {
    const file = join(dir, 'backups.json')
    await writeFile(file, '{ not json', 'utf8')
    const store = new BackupStore(file)
    expect(await store.list()).toEqual([])
    await store.append({ kind: 'tweaks', label: 'fresh', tweakIds: [], items: [] })
    const saved = JSON.parse(await readFile(file, 'utf8')) as { entries: unknown[] }
    expect(saved.entries.length).toBe(1)
  })
})

describe('pruneEntries', () => {
  const e = (id: string, createdAt: string, reverted: boolean): BackupEntry => ({
    id,
    createdAt,
    tweakIds: [],
    kind: 'tweaks',
    label: id,
    items: [],
    revertedAt: reverted ? createdAt : null,
  })

  it('drops the oldest reverted entries first and never unreverted ones', () => {
    const entries = [e('a', '2026-01-01', true), e('b', '2026-01-02', false), e('c', '2026-01-03', true), e('d', '2026-01-04', false)]
    expect(pruneEntries(entries, 3).map((x) => x.id)).toEqual(['b', 'c', 'd'])
    expect(pruneEntries(entries, 1).map((x) => x.id)).toEqual(['b', 'd'])
    expect(pruneEntries(entries, 10).length).toBe(4)
  })
})
