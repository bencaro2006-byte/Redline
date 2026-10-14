// Read-only PowerShell smoke test (Windows only). Never changes anything:
//  1. Get-TweakState.ps1 reads every catalog action.
//  2. The snapshots are fed back to Invoke-Tweaks.ps1 as a DRY-RUN restore: nothing may report a change.
//  3. A power setting that does not exist must come back as "not present", not as an error.
// Usage: node scripts/ps-smoke.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(root, 'resources', 'scripts')
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const catalog = JSON.parse(readFileSync(join(root, 'src', 'main', 'catalog', 'catalog.json'), 'utf8'))

function run(script, input) {
  const json = JSON.stringify(input).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(scripts, script)], {
    input: json,
    encoding: 'utf8',
    maxBuffer: 20_000_000,
    windowsHide: true,
  })
  const line = (result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
  const out = JSON.parse(line)
  if (!out.ok) throw new Error(`${script}: ${out.error.code} ${out.error.message}`)
  return out.data
}

let failures = 0
const fail = (message) => {
  failures += 1
  process.stdout.write(`FAIL ${message}\n`)
}

const items = catalog.tweaks.flatMap((t) => t.actions.map((action, i) => ({ key: `${t.id}#${i}`, action })))
const probe = run('Get-TweakState.ps1', { items })
const snapshots = probe.results.filter((r) => r.snapshot !== undefined)
probe.results.filter((r) => r.snapshot === undefined).forEach((r) => process.stdout.write(`note ${r.key}: ${r.error} (needs administrator?)\n`))

const byKey = new Map(items.map((i) => [i.key, i.action]))
const restore = run('Invoke-Tweaks.ps1', {
  dryRun: true,
  items: snapshots.map((r) => ({ key: r.key, op: 'restore', action: byKey.get(r.key), restore: r.snapshot })),
})
restore.results.filter((r) => !r.ok || r.changed).forEach((r) => fail(`restoring the current value of ${r.key} would change it: ${r.error ?? 'changed'}`))

const missing = run('Get-TweakState.ps1', {
  items: [{ key: 'missing#0', action: { type: 'powercfg', subgroup: '54533251-82be-4824-96c1-47b60b740d00', setting: '11111111-2222-3333-4444-555555555555', ac: 1, dc: 1, defaultAc: 0, defaultDc: 0, hidden: false } }],
})
if (missing.results[0]?.snapshot?.exists !== false) fail(`a missing power setting should be "not present": ${JSON.stringify(missing.results[0])}`)

process.stdout.write(`${items.length} actions, ${snapshots.length} read, ${restore.results.length} dry-run restores, ${failures} failures\n`)
process.exit(failures > 0 ? 1 : 0)
