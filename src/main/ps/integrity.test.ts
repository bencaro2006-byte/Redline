import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COMMON_SCRIPT, sha256File, verifyScriptIntegrity } from './integrity'
import { SCRIPT_SHA256 } from './scriptHashes'

const SCRIPTS_DIR = resolve('resources', 'scripts')

describe('embedded script hashes', () => {
  it('match every script on disk (run `node scripts/hash-scripts.mjs` after editing a script)', async () => {
    const names = (await readdir(SCRIPTS_DIR)).filter((n) => n.endsWith('.ps1')).sort()
    expect(Object.keys(SCRIPT_SHA256).sort()).toEqual(names)
    for (const name of names) expect(sha256File(join(SCRIPTS_DIR, name))).toBe(SCRIPT_SHA256[name])
  })
})

describe('verifyScriptIntegrity', () => {
  let dir: string
  const hashes: Record<string, string> = {}

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'redline-integrity-'))
    await writeFile(join(dir, 'Get-Thing.ps1'), 'Write-Output 1', 'utf8')
    await writeFile(join(dir, COMMON_SCRIPT), '# common', 'utf8')
    hashes['Get-Thing.ps1'] = sha256File(join(dir, 'Get-Thing.ps1'))
    hashes[COMMON_SCRIPT] = sha256File(join(dir, COMMON_SCRIPT))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('passes untouched scripts and skips the check when not enforced', async () => {
    expect(verifyScriptIntegrity(dir, 'Get-Thing.ps1', true, hashes)).toEqual({ ok: true })
    expect(verifyScriptIntegrity(dir, 'Nope.ps1', false, hashes)).toEqual({ ok: true })
  })

  it('rejects a modified script, a modified helper, a missing file and an unknown script', async () => {
    await writeFile(join(dir, COMMON_SCRIPT), '# common (tampered)', 'utf8')
    expect(verifyScriptIntegrity(dir, 'Get-Thing.ps1', true, hashes)).toMatchObject({ ok: false, error: expect.stringMatching(/modified/) })
    expect(verifyScriptIntegrity(dir, 'Missing.ps1', true, { ...hashes, 'Missing.ps1': 'ab' })).toMatchObject({ ok: false, error: expect.stringMatching(/missing/) })
    expect(verifyScriptIntegrity(dir, 'Unknown.ps1', true, hashes)).toMatchObject({ ok: false, error: expect.stringMatching(/no recorded checksum/) })
  })
})
