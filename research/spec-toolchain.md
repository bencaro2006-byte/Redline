# Toolchain spec: Redline Optimizer (Windows-only Electron app)

Verified 2026-10-09. Sources: `npm view` (versions, peerDependencies, engines, dist-tags, publish times); Electron `releases.json`; electron-vite 5.0.0 source and typings; app-builder-lib 26.15.3 `scheme.json`; Electron 44.7.0 `electron.d.ts`; Vite 7.3.7 and @vitejs/plugin-react 5.2.0 source; TypeScript 6.0 release notes.
Host: Node v24.13.1, npm 11.8.0, no Visual Studio Build Tools, so **no native modules that need compiling**.

---

## 1. Pinned versions

| Package | Pin | Notes |
|---|---|---|
| electron | **44.7.0** | `latest` (2026-10-07). Bundles **Node 24.21.0** and Chromium 152.0.7977.130. Engines `node >= 22.12.0`. |
| electron-vite | **5.0.0** | `latest` stable. Peer `vite: ^5 \|\| ^6 \|\| ^7`, so it **does not accept Vite 8**. `@swc/core` is an optional peer and isn't needed. 6.0.0-beta.7 adds Vite 8 support but is beta, so skip it. |
| vite | **7.3.7** | Newest 7.x (2026-10-06). Vite 8.3.4 is `latest`, but electron-vite 5 rejects it. |
| @vitejs/plugin-react | **5.2.0** | Peer `vite ^4 … ^8`. **6.x (6.1.2) requires `vite ^8`**, so it's incompatible here. |
| react / react-dom | **19.3.0** | react-dom peers `react ^19.3.0`. |
| @types/react / @types/react-dom | **19.3.0** | @types/react-dom peers `@types/react ^19.3.0`. |
| typescript | **7.0.2** | `latest`. This is the native (Go) compiler: `tsc` ships as a prebuilt binary via the optional dep `@typescript/typescript-win32-x64`, so nothing compiles. Used **only for type-checking** because Vite/esbuild does the transpiling. The root export has no JS API, so if you add typescript-eslint (8.71.1, peer `typescript >=4.8.4 <6.1.0`) use **typescript 6.0.3** instead. |
| @types/node | **24.19.1** | Match Electron's Node 24. Don't use 26.6.4 (`latest`), which describes Node 26 APIs. Satisfies Vite's peer `^20.19.0 \|\| >=22.12.0`. |
| electron-builder | **26.15.3** | `latest` dist-tag (2026-06-09). 26.17.0 exists under the `v26` tag and 27.0.0-alpha.10 under `next`. Stay on `latest` unless you need a specific fix. |
| zod | **4.6.5** | IPC validation in the main process. No peers. |
| lucide-react | **1.54.0** | Published almost daily, so any recent 1.5x is fine. Peer `react ^16.5.1 … ^19`. Renders inline `<svg>`, so there's no CSP impact. |
| png-to-ico (optional) | 3.0.2 | Pure JS, for a dev script that builds `.ico` files from PNGs. |

**Compatibility confirmed**
- electron-vite 5.0.0 + vite 7.3.7 + plugin-react 5.2.0: all peer ranges are satisfied.
- electron-vite has no `electron` peer. It reads the installed Electron major to choose esbuild targets, but its table stops at Electron 39, so for 44 it **falls back to `node22.20` / `chrome142`**. This is harmless and only means slightly more down-leveling. To override, set `build.target: 'node24'` (main/preload) and `'chrome152'` (renderer).
- Engines: Vite, electron-vite and plugin-react need `^20.19.0 || >=22.12.0`, and Electron needs `>=22.12.0`. Node 24.13.1 meets all of them.
- No compiling anywhere. esbuild and Rollup ship prebuilt win32-x64 binaries as optionalDependencies. Electron's postinstall downloads a prebuilt binary. TS 7 is a prebuilt binary. Set `npmRebuild: false`. Don't add node-gyp deps (ffi-napi, robotjs, native registry/WMI bindings, etc.); reach the system through PowerShell instead (§6).

**Install (project-local only)**
```
npm i -D -E electron@44.7.0 electron-vite@5.0.0 electron-builder@26.15.3 vite@7.3.7 @vitejs/plugin-react@5.2.0 react@19.3.0 react-dom@19.3.0 typescript@7.0.2 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.1 zod@4.6.5 lucide-react@1.54.0
```
- **Put everything in `devDependencies`.** electron-vite only externalizes `dependencies` (`build.externalizeDeps` defaults to true), so devDeps get bundled. The asar then has no `node_modules`, and that matters because a sandboxed preload can't `require` npm packages anyway.
- Commit `package-lock.json` and use `npm ci`.
- The first `electron-builder` run downloads NSIS (and possibly winCodeSign) into `%LOCALAPPDATA%\electron-builder\Cache`. That's a user cache, not a global install.

---

## 2. Project layout (electron-vite conventions)

```
redline-optimizer/
├─ package.json              # "main": "./out/main/index.js" — NO "type": "module"
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tsconfig.json             # references only (editor)
├─ tsconfig.node.json        # main + preload + shared
├─ tsconfig.web.json         # renderer + shared
├─ build/                    # buildResources (not shipped): icon.ico (256 layer required)
├─ resources/                # shipped via extraResources
│  ├─ scripts/*.ps1
│  └─ icons/tray.ico
├─ src/
│  ├─ main/index.ts          # lifecycle, window, tray, IPC registration
│  ├─ main/ipc/*.ts          # handlers + zod schemas
│  ├─ main/ps/runner.ts      # PowerShell runner (§6)
│  ├─ preload/index.ts       # contextBridge API (CJS, sandboxed)
│  ├─ preload/index.d.ts     # Window.redline typing for the renderer
│  ├─ shared/api.ts          # channel names + types only (no runtime deps)
│  └─ renderer/
│     ├─ index.html          # CSP <meta> (§5)
│     └─ src/main.tsx, App.tsx …
├─ out/                      # electron-vite output
└─ release/                  # installers
```
- Default entries are `src/main/index.ts`, `src/preload/index.ts` and `src/renderer/index.html`. They build to `out/main/index.js`, `out/preload/index.js` and `out/renderer/index.html`. In dev, electron-vite sets `process.env.ELECTRON_RENDERER_URL`.
- **No `"type": "module"`.** With it, electron-vite emits ESM `.mjs` for main and preload, but a sandboxed preload must be CommonJS. Leaving it out keeps both outputs as CJS `index.js`.
- `app.getAppPath()` points to the project root in dev and to `resources/app.asar` when packaged.

**package.json (relevant parts)**
```json
{
  "name": "redline-optimizer",
  "productName": "Redline Optimizer",
  "version": "0.1.0",
  "description": "…",
  "author": "…",
  "private": true,
  "main": "./out/main/index.js",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "electron-vite dev",
    "typecheck": "tsc --noEmit -p tsconfig.node.json --composite false && tsc --noEmit -p tsconfig.web.json --composite false",
    "build": "npm run typecheck && electron-vite build",
    "dist": "npm run build && electron-builder --win --x64",
    "dist:dir": "npm run build && electron-builder --win --x64 --dir"
  }
}
```
Set `author`, because electron-builder uses it for the exe's CompanyName.

**electron.vite.config.ts**
```ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
  },
})
```
`externalizeDepsPlugin()` and `bytecodePlugin()` are **deprecated in v5**; use `build.externalizeDeps` / `build.bytecode` instead. Ignore older templates that still use the plugins.

**tsconfig.json**
```json
{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }] }
```
**tsconfig.node.json**
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2024", "lib": ["ES2024"],
    "module": "ESNext", "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "isolatedModules": true, "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "paths": { "@shared/*": ["./src/shared/*"] }
  },
  "include": ["electron.vite.config.ts", "src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```
**tsconfig.web.json** is the same, except:
`"lib": ["ES2024", "DOM"]`, `"jsx": "react-jsx"`, `"types": ["vite/client"]`, `paths` gets `"@renderer/*": ["./src/renderer/src/*"]` added, and `include` is `["src/renderer/src/**/*", "src/preload/index.d.ts", "src/shared/**/*"]`.

**TS 6/7 default changes that will bite** (TS 7 removes the deprecated options entirely):
- `strict` now defaults to true.
- **`types` now defaults to `[]`.** List `node` or `vite/client` explicitly, or `process`, `__dirname`, `import.meta.env` and `*.css` imports will fail.
- `noUncheckedSideEffectImports` now defaults to true. `import './app.css'` needs the `vite/client` types.
- `rootDir` now defaults to the tsconfig's own directory.
- **`baseUrl` is deprecated**; use `paths` without it.
- `moduleResolution: node`/`node10`/`classic` is deprecated.
- `esModuleInterop: false` is deprecated.
- `target: es5` is deprecated.
- `dom.iterable` is now merged into `DOM`.

---

## 3. electron-builder (Windows: NSIS + portable)

**electron-builder.yml**
```yaml
appId: com.redline.optimizer
productName: Redline Optimizer
directories:
  buildResources: build
  output: release/${version}
files:
  - out/**/*
  - package.json
  - "!**/*.map"
extraResources:                      # -> <install>/resources/…  (process.resourcesPath)
  - from: resources/scripts
    to: scripts
    filter: ["**/*.ps1"]
  - from: resources/icons
    to: icons
asar: true
npmRebuild: false                    # no native deps
electronLanguages: [en-US]           # trims locale .pak files; add more if the UI is localized
electronFuses:                       # @electron/fuses, flipped at package time
  runAsNode: false
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableCookieEncryption: true
  onlyLoadAppFromAsar: true
  # enableEmbeddedAsarIntegrityValidation: true   # enable only after confirming the packaged exe still launches
  # grantFileProtocolExtraPrivileges: leave default (true) — Vite's module scripts loaded via file:// need it
win:
  target:
    - { target: nsis, arch: [x64] }
    - { target: portable, arch: [x64] }
  icon: build/icon.ico
  executableName: RedlineOptimizer
  requestedExecutionLevel: requireAdministrator   # only allowed under `win`, not per target
  signAndEditExecutable: true        # default — KEEP: writes icon, version info AND the UAC level (via resedit)
  signExecutable: false              # no certificate yet; resource editing still happens
nsis:
  oneClick: false
  perMachine: true                   # Program Files (admin-write only) — right for an admin tool
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Redline Optimizer
  runAfterFinish: true               # verify on a clean VM; set false if the post-install launch misbehaves
  artifactName: ${name}-${version}-setup-${arch}.${ext}
portable:
  requestExecutionLevel: admin       # stub elevates once up front (default "user")
  artifactName: ${name}-${version}-portable-${arch}.${ext}
```

**Notes**
- **`requestedExecutionLevel`** accepts `asInvoker` (default), `highestAvailable` or `requireAdministrator`. It's embedded in the exe manifest during the resource-edit step, so **don't set `signAndEditExecutable: false`**: that would also drop the icon and the UAC level.
- **Artifact naming:** both targets produce `.exe`. The defaults are `${productName} Setup ${version}.exe` and `${productName} ${version}.exe`, which contain spaces and look nearly identical. Set a per-target `artifactName` and use `${name}` (the package name). The result is `redline-optimizer-0.1.0-setup-x64.exe` and `redline-optimizer-0.1.0-portable-x64.exe`. Available macros: `${name} ${productName} ${version} ${arch} ${os} ${ext} ${env.X}`.
- **Portable target:**
  - It's an NSIS stub that extracts the app to `%TEMP%` **on every launch**, so startup is slow.
  - It exposes `PORTABLE_EXECUTABLE_DIR` and `PORTABLE_EXECUTABLE_FILE` to the app, which is useful for storing settings next to the exe.
  - With the default stub level `user`, launching a `requireAdministrator` exe from the stub can fail (ERROR_ELEVATION_REQUIRED 740) or prompt twice. Hence `requestExecutionLevel: admin`; verify on a VM.
  - **Security caveat:** an elevated app running out of a user-writable temp directory can be tampered with by non-admin malware between extraction and launch. Treat the NSIS per-machine installer as the primary download. For portable, at least verify `.ps1` hashes before running them (§6) and consider the asar-integrity fuse.
- **Icons:**
  - `build/icon.ico` must include a **256×256** layer; include 16, 24, 32, 48, 64 and 128 as well. Alternatively, provide `build/icon.png` of at least 256×256 (512 recommended) and electron-builder will convert it.
  - `installerIcon` and `uninstallerIcon` default to `build/installerIcon.ico` / `build/uninstallerIcon.ico`, or the app icon if those don't exist.
  - The tray needs a **separate `.ico` file** shipped via `extraResources`, because the exe-embedded icon isn't a file you can load. Use 16, 20, 24, 32, 40 and 48 px layers for 100–300% DPI.
- **Unsigned builds:**
  - SmartScreen shows "Windows protected your PC" on first run, and the UAC prompt shows "Publisher: Unknown".
  - To sign later, use `win.signtoolOptions` *or* `win.azureSignOptions` (Azure Trusted Signing), not both.
  - 26.x edits resources with `resedit` (JS). If an early build ever fails extracting winCodeSign with "Cannot create symbolic link", enable Windows Developer Mode, or run that one build from an elevated shell.
- `deleteAppDataOnUninstall` only applies to one-click installers, so it does nothing here.

---

## 4. Frameless window with a custom title bar

Two options:
- **Recommended: `titleBarStyle: 'hidden'` + `titleBarOverlay`.** Windows draws its native min/max/close buttons over your HTML title bar. You keep the Win11 Snap Layouts flyout, correct hit-testing and accessibility.
- **Alternative: `frame: false` + your own buttons over IPC.** This gives full control, but you lose the snap flyout and have to sync maximize state yourself (`maximize`/`unmaximize` events).

```ts
Menu.setApplicationMenu(null) // drops default menu + its accelerators (Ctrl+R reload, Ctrl+Shift+I)

const win = new BrowserWindow({
  width: 1180, height: 760, minWidth: 960, minHeight: 620,
  show: false,
  backgroundColor: '#0d0d10',                 // no white flash; match theme
  titleBarStyle: 'hidden',
  titleBarOverlay: { color: '#0d0d10', symbolColor: '#e6e6e6', height: 40 },
  // backgroundMaterial: 'mica',              // 'auto'|'none'|'mica'|'acrylic'|'tabbed' — Win11 only, optional
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: !app.isPackaged,
  },
})
win.once('ready-to-show', () => win.show())
if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
else void win.loadFile(join(__dirname, '../renderer/index.html'))
```
- When the theme changes, call `win.setTitleBarOverlay({ color, symbolColor, height })`. In Electron 44, `TitleBarOverlay` is `{ color?, symbolColor?, height? }`.
- Renderer CSS: use the Window Controls Overlay env vars instead of hard-coded offsets. They also handle RTL layouts where the buttons sit on the left.
```css
.titlebar {
  position: fixed; top: 0;
  left: env(titlebar-area-x, 0); width: env(titlebar-area-width, 100%);
  height: env(titlebar-area-height, 40px);
  -webkit-app-region: drag; app-region: drag; user-select: none;
}
.titlebar :is(button, a, input, select, [role="button"]) { -webkit-app-region: no-drag; app-region: no-drag; }
```
  Drag regions swallow clicks, so every interactive element inside one needs `no-drag`.

---

## 5. Security defaults

In Electron 44, `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false` are already the defaults. **Set them explicitly anyway**, so a refactor can't silently undo them and a grep can confirm them.

```ts
app.enableSandbox()                                  // before 'ready': forces sandbox on every renderer
if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('com.redline.optimizer')       // must equal build appId (taskbar grouping, notifications)

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' } })
  contents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) e.preventDefault() })
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

app.whenReady().then(() => {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))  // no camera/mic/notifications-from-web/etc.
  ses.setPermissionCheckHandler(() => false)
  // createWindow(), createTray(), registerIpc() …
})
```
- `isAppUrl(url)`: in dev, the URL starts with `process.env.ELECTRON_RENDERER_URL`. When packaged, it equals `pathToFileURL(join(__dirname, '../renderer/index.html')).href`, ignoring the hash.
- `openExternalSafe`: allow only `https:` URLs on a fixed host allowlist. **Elevation caveat:** anything the app launches inherits the admin token, so `shell.openExternal` opens an *elevated* browser. Keep external links minimal. A common workaround is `spawn(explorer.exe, [url])`, which hands the URL to the non-elevated shell. Verify it on the target OS.

**CSP**: put it in `src/renderer/index.html` as the first element in `<head>`.
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
```
- **It works in dev as-is:**
  - The Vite client loads from `'self'`.
  - The HMR websocket is on the same host and port; Chromium's CSP3 matching lets `'self'` cover `ws:`.
  - plugin-react 5.2.0's inline Fast Refresh preamble is injected as `head-prepend`, after Vite's dev HTML hook. It therefore lands *before* the meta tag, and policies in a meta tag don't apply to content that comes before it. Verified in the Vite 7.3.7 and plugin-react 5.2.0 source.
  - Vite injects CSS as `<style>` in dev, which is why `style-src 'unsafe-inline'` is there.
- Self-host fonts and load no remote scripts. Keep `img-src data:` only if you use it.
- `frame-ancestors` is ignored in a meta tag.
- Check the DevTools console for CSP violations in both `npm run dev` and the packaged build.

**Typed contextBridge API**

`src/shared/api.ts` (types and constants only):
```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
export const IPC = {
  getStatus: 'status:get',
  createRestorePoint: 'restore:create',
  runTweak: 'tweak:run',
  taskProgress: 'task:progress',
} as const
export interface RedlineApi {
  getStatus(): Promise<Result<SystemStatus>>
  createRestorePoint(req: { description: string }): Promise<Result<RestorePointResult>>
  runTweak(req: { id: TweakId; enable: boolean }): Promise<Result<TweakResult>>
  onTaskProgress(cb: (p: TaskProgress) => void): () => void   // returns unsubscribe
}
```
`src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type RedlineApi, type TaskProgress } from '@shared/api'

const api: RedlineApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  createRestorePoint: (req) => ipcRenderer.invoke(IPC.createRestorePoint, req),
  runTweak: (req) => ipcRenderer.invoke(IPC.runTweak, req),
  onTaskProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, p: TaskProgress) => cb(p)
    ipcRenderer.on(IPC.taskProgress, listener)
    return () => { ipcRenderer.removeListener(IPC.taskProgress, listener) }
  },
}
contextBridge.exposeInMainWorld('redline', api)
```
`src/preload/index.d.ts`:
```ts
import type { RedlineApi } from '../shared/api'
declare global { interface Window { redline: RedlineApi } }
export {}
```
Preload rules:
- Never expose `ipcRenderer`, a generic `invoke(channel, …)` or the IPC `event` object. Expose one function per capability.
- Under the sandbox, the preload's `require` only offers `electron`, `events`, `timers` and `url`. Everything else must be bundled local code.
- Keep zod out of the preload. Validation belongs in main.

**Validating IPC in main (zod 4)**
```ts
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

const RunTweakReq = z.strictObject({ id: z.enum(TWEAK_IDS), enable: z.boolean() })
const RestoreReq = z.strictObject({ description: z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} ._()-]+$/u) })

const fail = (code: string, message: string) => ({ ok: false, error: { code, message } }) as const

const isTrustedSender = (e: IpcMainInvokeEvent): boolean =>
  e.sender === mainWindow?.webContents && e.senderFrame?.parent === null && isAppUrl(e.senderFrame.url)

export function handle<S extends z.ZodType, R>(channel: string, schema: S, fn: (req: z.infer<S>) => Promise<R>): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    if (!isTrustedSender(event)) return fail('FORBIDDEN', 'Untrusted sender')
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return fail('INVALID_INPUT', z.prettifyError(parsed.error))
    try { return { ok: true, data: await fn(parsed.data) } as const }
    catch (err) { log.error(channel, err); return fail('FAILED', err instanceof Error ? err.message : String(err)) }
  })
}
```
Return a `Result` union instead of throwing. Rejections from `ipcMain.handle` reach the renderer as a flattened "Error invoking remote method …" string, so the structure is lost.

---

## 6. Running bundled PowerShell scripts from main

**Rules**
1. Spawn **Windows PowerShell 5.1** by absolute path: `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`. Don't rely on a PATH lookup and don't use `pwsh`, because `Checkpoint-Computer` only exists in 5.1.
2. Call `spawn(exe, argsArray, { shell: false, windowsHide: true })` with `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <absolute .ps1>`. **Never** use `-Command` with interpolated strings, `shell: true` or `exec()`.
3. Pick scripts from a **hard-coded allowlist** (id → filename). The renderer never sends paths, script text or raw arguments.
4. Pass input as **JSON on stdin** and escape every non-ASCII character as `\uXXXX`. Windows PowerShell 5.1 decodes stdin with the console's OEM code page (e.g. 862 on Hebrew systems), and ASCII-only input sidesteps that entirely.
5. The script writes **exactly one JSON line to stdout**, and all diagnostics go to stderr. Node parses the last non-empty line, strips a leading BOM and validates it with zod.
6. On timeout, kill the whole tree with `taskkill /PID <pid> /T /F`. `child.kill()` only kills powershell.exe, not anything it started.
7. Run scripts one at a time through a simple promise queue.
8. Resolve paths as `process.resourcesPath/scripts` when packaged and `app.getAppPath()/resources/scripts` in dev.
9. Optionally check integrity: compare each `.ps1`'s SHA-256 against hashes embedded in the main bundle at build time. This matters for the portable build (§3).
10. `-ExecutionPolicy Bypass` only sets the *Process* scope; a Group Policy execution policy still wins, so surface that error. Defender/AMSI scans scripts, so keep them plain: no `-EncodedCommand`, no obfuscation.

**`src/main/ps/runner.ts`**
```ts
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import type { z } from 'zod'

const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows'
const POWERSHELL = join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const TASKKILL = join(SYSTEM_ROOT, 'System32', 'taskkill.exe')
const MAX_STDOUT_BYTES = 1_000_000

export const SCRIPTS = { restorePoint: 'New-RestorePoint.ps1', status: 'Get-Status.ps1' } as const
export type ScriptId = keyof typeof SCRIPTS

const scriptsDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'scripts') : join(app.getAppPath(), 'resources', 'scripts')

// Every non-ASCII char as \uXXXX: immune to console code pages.
const toAsciiJson = (value: unknown): string =>
  JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

const killTree = (child: ChildProcess): void => {
  if (child.pid !== undefined) spawn(TASKKILL, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
}

export function runScript<S extends z.ZodType>(id: ScriptId, input: unknown, schema: S, timeoutMs = 60_000): Promise<z.infer<S>> {
  return new Promise((resolve, reject) => {
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(scriptsDir(), SCRIPTS[id])]
    const child = spawn(POWERSHELL, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let bytes = 0
    let settled = false
    const timer = setTimeout(() => { killTree(child); finish(new Error(`${id}: timed out after ${timeoutMs} ms`)) }, timeoutMs)
    function finish(error: Error | null, value?: z.infer<S>): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value as z.infer<S>)
    }
    child.stdout.on('data', (b: Buffer) => {
      bytes += b.length
      if (bytes > MAX_STDOUT_BYTES) { killTree(child); finish(new Error(`${id}: output too large`)); return }
      out.push(b)
    })
    child.stderr.on('data', (b: Buffer) => { err.push(b) })
    child.on('error', (e) => finish(e))
    child.on('close', (code) => {
      const text = Buffer.concat(out).toString('utf8').replace(/^\uFEFF/, '').trim()
      const last = text.split(/\r?\n/).at(-1) ?? ''
      let json: unknown
      try { json = JSON.parse(last) } catch {
        const stderr = Buffer.concat(err).toString('utf8').trim().slice(0, 2000)
        finish(new Error(`${id}: exit ${code}, no JSON on stdout. ${stderr}`))
        return
      }
      const parsed = schema.safeParse(json)
      if (parsed.success) finish(null, parsed.data)
      else finish(new Error(`${id}: unexpected output shape (exit ${code})`))
    })
    child.stdin.on('error', () => { /* EPIPE if the script exits before reading stdin; reported via 'close' */ })
    child.stdin.end(toAsciiJson(input))
  })
}
```
Give each script's `schema` the `{ ok: true, data } | { ok: false, error }` envelope (`z.discriminatedUnion('ok', …)`).

**Script template (`resources/scripts/*.ps1`)**
```powershell
#Requires -Version 5.1
#Requires -RunAsAdministrator          # only on scripts that need admin; fails fast to stderr, exit 1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'           # progress UI slows cmdlets and can leak to the host
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false   # UTF-8, no BOM (default is the OEM code page)

function Write-Result([hashtable]$Result) {
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $Result -Depth 10 -Compress))
}

try {
  $raw = [Console]::In.ReadToEnd()
  $req = if ([string]::IsNullOrWhiteSpace($raw)) { $null } else { $raw | ConvertFrom-Json }
  # re-validate $req here (defence in depth)
  # … work …
  Write-Result @{ ok = $true; data = @{ } }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = @{ code = 'SCRIPT_ERROR'; message = $_.Exception.Message } }
  exit 1
}
```
**Windows PowerShell 5.1 gotchas**
- `ConvertTo-Json` defaults to `-Depth 2` and **silently truncates** anything deeper. Always pass `-Depth`.
- DateTime values serialize as `"\/Date(…)\/"`. Emit `$dt.ToString('o')` instead.
- Enums serialize as integers. Cast with `[string]` if you want the name.
- Pipelines unroll arrays: a single-element array becomes a scalar and an empty array becomes nothing. Use `ConvertTo-Json -InputObject @($items)`.
- `ConvertFrom-Json` returns a PSCustomObject, and under StrictMode a missing property throws. Test with `$req.PSObject.Properties['name']`.
- `Write-Host` and `Write-Output` noise lands on stdout and breaks the one-line protocol. Log with `[Console]::Error.WriteLine(...)`.
- `$ErrorActionPreference='Stop'` doesn't cover native exes (`reg.exe`, `powercfg.exe`, …). Check `$LASTEXITCODE` yourself.

---

## 7. Detecting elevation

**From Node (no PowerShell start-up cost)**
```ts
import { execFile } from 'node:child_process'
export function isElevated(): Promise<boolean> {
  const whoami = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe')
  return new Promise((resolve) => {
    execFile(whoami, ['/groups', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000 }, (err, stdout) =>
      resolve(!err && /S-1-16-(12288|16384)/.test(stdout)))   // High / System mandatory label
  })
}
```
Mandatory-label SIDs don't depend on the locale; group names are localized.

**Inside PowerShell**
```powershell
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```
- **Packaged builds always run elevated** because of `requireAdministrator`, so there's a UAC prompt on every launch.
- `npm run dev` is **not** elevated unless you start it from an elevated terminal. Keep the check, and show a "not elevated" state instead of crashing.
- **Consequences of always running elevated:**
  - **Auto-start:** Windows blocks elevated apps launched from the Run key, so `app.setLoginItemSettings` won't work. Use a scheduled task instead: `schtasks /Create /SC ONLOGON /RL HIGHEST …`. This is a system change, so make it opt-in.
  - **Drag-and-drop:** UIPI blocks dropping files from (non-elevated) Explorer.
  - **Different admin account:** if the user elevates with another account's credentials, the app runs as that account, so `app.getPath('userData')` is under that profile.
  - **External links:** browsers opened from the app run elevated (§5).

---

## 8. System restore point (`Checkpoint-Computer`)

`resources/scripts/New-RestorePoint.ps1`, the work section inside the template's `try`:
```powershell
$desc = [string]$req.description                         # already validated in main; re-check length
if ($desc.Length -lt 1 -or $desc.Length -gt 60) { throw 'Invalid description length' }

$before = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
Checkpoint-Computer -Description $desc -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue -WarningVariable cpWarn
$after = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1

$created = ($null -ne $after) -and (($null -eq $before) -or ($after.SequenceNumber -gt $before.SequenceNumber))
$latestAt = if ($after) { [Management.ManagementDateTimeConverter]::ToDateTime($after.CreationTime).ToString('o') } else { $null }
Write-Result @{ ok = $true; data = @{
  created = $created
  skippedRecent = (-not $created) -and ($cpWarn.Count -gt 0)
  latestCreatedAt = $latestAt
  warning = (($cpWarn | ForEach-Object { $_.Message }) -join ' ')
} }
```
- `Checkpoint-Computer` exists **only in Windows PowerShell 5.1** (it's not in PowerShell 7) and **requires admin**.
- The type is `APPLICATION_INSTALL` (default), `APPLICATION_UNINSTALL`, `DEVICE_DRIVER_INSTALL`, `MODIFY_SETTINGS` or `CANCELLED_OPERATION`. Use `MODIFY_SETTINGS`.
- **24-hour limit:**
  - Windows skips creating a new point if *any* restore point (from any app, including Windows Update) was made in the last **1440 minutes**.
  - When that happens, `Checkpoint-Computer` only writes a **WARNING**: no error, exit code 0. **Detect it explicitly** by comparing `SequenceNumber` before and after, or by checking `-WarningVariable`, then tell the user "a restore point from <time> already exists (<24 h old). Continue?".
  - The limit is the DWORD `SystemRestorePointCreationFrequency` (minutes; `0` means no limit) under `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore`. When the value is absent, the limit is 1440.
  - Changing it is a system modification, so do it only with explicit opt-in, and restore the original value (or delete it if it was absent) in a `finally`.
- **System Protection off:** if protection is disabled on the system drive, the cmdlet fails. Catch that and return a code like `SYSTEM_PROTECTION_DISABLED`. Enabling it (`Enable-ComputerRestore -Drive "$env:SystemDrive\"`) is a system change, so make it opt-in.
- **Slow:** the VSS snapshot can take from 30 s to several minutes. Use a timeout of 10 minutes or more, show indeterminate progress, and never run it in parallel with other scripts.
- `CreationTime` is a WMI datetime string; convert it with `ManagementDateTimeConverter`. Keep the description short (60 characters or fewer).

---

## 9. Tray icon

```ts
import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'

let tray: Tray | null = null          // module scope: an unreferenced Tray gets GC'd and the icon vanishes
let quitting = false
app.on('before-quit', () => { quitting = true })

const trayIconPath = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icons', 'tray.ico') : join(app.getAppPath(), 'resources', 'icons', 'tray.ico')

function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createTray(win: BrowserWindow): void {
  tray = new Tray(nativeImage.createFromPath(trayIconPath()))
  tray.setToolTip('Redline Optimizer')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Redline Optimizer', click: () => showWindow(win) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
  tray.on('click', () => (win.isVisible() ? win.hide() : showWindow(win)))
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide() } })   // close-to-tray
  app.on('second-instance', () => showWindow(win))                                // with requestSingleInstanceLock()
}
```
- Use a multi-size `.ico` (16, 20, 24, 32, 40, 48) so the icon stays crisp at every DPI.
- Toasts (`new Notification(...)`) need `app.setAppUserModelId(appId)`. They work reliably for the NSIS install, whose Start Menu shortcut carries the AUMID, but may not appear for the portable exe.
- Let users turn close-to-tray off in settings. Make sure Quit really quits (the `quitting` flag).

---

## 10. Upgrade watch-list
- **Vite 8 / plugin-react 6:** move once **electron-vite 6.0.0** goes stable (its beta peers `vite ^6 || ^7 || ^8` and bundles rolldown). Until then, stay on vite 7.3.7 with plugin-react 5.2.0.
- **typescript-eslint:** it doesn't support TS 7 yet (peer `<6.1.0`). If you add linting before it does, use typescript 6.0.3.
- **Electron:** a new major ships about every 8 weeks, and only the latest three majors (currently 44/43/42) get security fixes, so plan regular bumps. electron-vite's target table will lag; that's harmless (§1).
- **electron-builder:** the `latest` tag (26.15.3) trails the `v26` tag (26.17.0). Re-check `npm view electron-builder dist-tags` before releases.
