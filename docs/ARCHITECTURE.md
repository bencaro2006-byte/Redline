# Architecture

## Processes and trust

```
renderer (sandboxed, CSP)  --window.redline-->  preload (CJS, one fn per capability)
        --ipcRenderer.invoke-->  main (elevated)  --spawn powershell.exe -File-->  resources/scripts/*.ps1
```

- The renderer never sends paths, script text, registry locations or package names that are not
  in the bundled catalog. IPC handlers (`src/main/ipc/register.ts`) check the sender frame and
  validate every request with zod (`schemas.ts`): tweak ids must exist in the catalog, app
  packages must be in the catalog's removable list and never in `neverRemove`.
- System-changing calls need elevation unless dry run is on, and run one at a time (`mutex.ts`).
- PowerShell is started by absolute path with an argument array, from a hard-coded script
  allowlist (`ps/runner.ts`). Input is JSON on stdin (non-ASCII escaped), output is exactly one
  JSON line validated with zod. Scripts re-validate their input and refuse real changes when
  not elevated. Dry run is the default inside the scripts when the flag is missing.

Hardening for the elevated side (from the security review):

- `ps/env.ts`: every child process gets a scrubbed environment (no user module paths, .NET
  profiler variables or planted PATH entries; `SystemRoot` validated).
- `ps/integrity.ts`: the packaged app checks each script's SHA-256 (embedded at build time by
  `scripts/hash-scripts.mjs`) before running it.
- `installLocation.ts`: the packaged app refuses to run outside Program Files; the installer is
  per-machine with a fixed directory and there is no portable build.
- `engine/trust.ts` + `engine/targets.ts`: reverting a backup never runs an action read from
  disk. Tweak items are re-resolved from the bundled catalog by key and must still point at the
  same setting; game items must match the three registry shapes Games writes. `invoke()` refuses
  any command that is not byte-identical to a catalog command.

## Engine (`src/main/engine`)

1. `probe` (Get-TweakState.ps1, read-only) returns a Snapshot per action.
2. `evaluate.ts` compares snapshots with catalog targets: applied / partial / not-applied /
   not-applicable / unknown.
3. Apply: optional restore point -> probe "before" -> **journal written before any change**
   -> Invoke-Tweaks.ps1 `set` -> per-tweak report. Power plan switches run first; when the plan
   changes, power settings in the same batch are re-read on the new plan and re-journaled before
   they are written. A plan Redline creates is recorded for later deletion. Afterwards the entry
   keeps only items that really changed (or is removed when nothing did).
4. Revert: by backup entry (exact "before" values, reverse order) or by tweak (oldest unreverted
   journal value; without one, the catalog's Windows default, but only for settings still at
   Redline's value, so choices the user made are left alone). Game entries reverted from Backups
   go through the Games logic so the game's profile stays in sync.

Backups, settings, games and the scan cache are JSON files in `app.getPath('userData')`, written
atomically (temp file + rename); a corrupt file is moved aside, never deleted.

## Catalog

`research/tweaks-*.json` hold the verified research (paths, defaults and sources checked against
Microsoft documentation and read-only queries on the target PC). `scripts/build-catalog.mjs`
merges them into `src/main/catalog/catalog.json`, rejecting duplicate ids and any two tweaks
that would drive the same setting. The zod schema in `catalog/schema.ts` validates it at startup.

## Renderer

`AppDataProvider` loads catalog, tweak states and the scan once for all screens.
`ApplyFlowProvider` owns the single confirm -> progress -> results dialog used everywhere.
Screens live in `src/renderer/src/screens`, shared primitives in `src/renderer/src/ui`.
`npm run dev:web` runs the renderer in a browser against `src/renderer/src/mock`.
