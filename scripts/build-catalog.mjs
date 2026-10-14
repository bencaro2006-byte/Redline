// Builds src/main/catalog/catalog.json from the verified research files.
// Usage: node scripts/build-catalog.mjs
// The output is validated by the zod schema at app start and in src/main/catalog/catalog.test.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const research = join(root, 'research')
const output = join(root, 'src', 'main', 'catalog', 'catalog.json')
// The browser preview (npm run dev:web) uses the same catalog.
const mockOutput = join(root, 'src', 'renderer', 'src', 'mock', 'sample-catalog.json')

// Order matters: it is the default display order inside each category.
const TWEAK_FILES = [
  'tweaks-power-sched-gpu.json',
  'tweaks-gaming-input-visual.json',
  'tweaks-network-storage.json',
  'tweaks-privacy-services-debloat.json',
  'tweaks-extra.json',
]
const APPX_FILE = 'tweaks-privacy-services-debloat.json'

const readJson = (file) => JSON.parse(readFileSync(join(research, file), 'utf8'))

const tweaks = TWEAK_FILES.flatMap((file) => readJson(file).tweaks)

const seen = new Set()
for (const tweak of tweaks) {
  if (seen.has(tweak.id)) throw new Error(`duplicate tweak id: ${tweak.id}`)
  seen.add(tweak.id)
}

// Two tweaks must never drive the same registry value (or service/task) to different targets.
const targets = new Map()
for (const tweak of tweaks) {
  for (const action of tweak.actions) {
    const key =
      action.type === 'registry'
        ? `reg:${action.hive}\\${action.path}\\${action.name}`.toLowerCase()
        : action.type === 'service'
          ? `svc:${action.name}`.toLowerCase()
          : action.type === 'scheduledTask'
            ? `task:${action.path}`.toLowerCase()
            : action.type === 'powercfg'
              ? `pwr:${action.subgroup}/${action.setting}`.toLowerCase()
              : null
    if (key === null) continue
    const previous = targets.get(key)
    if (previous !== undefined) throw new Error(`${tweak.id} and ${previous} both change ${key}`)
    targets.set(key, tweak.id)
  }
}

const { appx, neverRemove, excluded } = readJson(APPX_FILE)

const catalog = {
  version: 1,
  generatedFor: 'Intel Core i7-7700 / NVIDIA GTX 1070 / Gigabyte B250M-DS3H / Windows 10 Pro 22H2 (19045)',
  tweaks,
  appx,
  neverRemove,
  excluded,
}

writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
writeFileSync(mockOutput, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')

const count = (key) => tweaks.reduce((acc, t) => ({ ...acc, [t[key]]: (acc[t[key]] ?? 0) + 1 }), {})
process.stdout.write(
  `catalog.json: ${tweaks.length} tweaks, ${appx.length} apps, ${neverRemove.length} protected, ${excluded.length} excluded\n` +
    `  by category ${JSON.stringify(count('category'))}\n` +
    `  by risk ${JSON.stringify(count('risk'))}\n` +
    `  recommended ${tweaks.filter((t) => t.recommended).length}\n`,
)
