// Dev tool (not shipped): renders the tach logo SVG to PNG layers with
// @resvg/resvg-js (prebuilt binary, no compiling) and packs them into .ico files
// with png-to-ico (pure JS).
//   build/icon.ico            app/installer icon: 16, 24, 32, 48, 64, 128, 256
//   resources/icons/tray.ico  tray icon:          16, 20, 24, 32, 40, 48
// Usage: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const COLORS = { tile: '#0E1013', rim: '#2C3139', arc: '#ECEEF1', needle: '#FF5A1F' }

/**
 * Dark rounded square, white tach arc, orange needle (the title-bar logo from
 * design/project/Main.dc.html on a tile). `bold` thickens strokes for tiny sizes.
 */
function logoSvg({ bold }) {
  const arc = bold ? 3.1 : 2.4
  const needle = bold ? 3.4 : 2.8
  const hub = bold ? 2.1 : 1.8
  const radius = bold ? 44 : 56
  // The 24-unit design glyph (with stroke) spans about x 2.8..21.2, y 7.8..18.8; center it on the tile.
  const glyph = 'translate(128 128) scale(8.6) translate(-12 -13.3)'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="6" y="6" width="244" height="244" rx="${radius}" fill="${COLORS.tile}" stroke="${COLORS.rim}" stroke-width="6"/>
  <g transform="${glyph}" fill="none" stroke-linecap="round">
    <path d="M4 17a8 8 0 1 1 16 0" stroke="${COLORS.arc}" stroke-width="${arc}"/>
    <path d="M12 17l5-6" stroke="${COLORS.needle}" stroke-width="${needle}"/>
    <circle cx="12" cy="17" r="${hub}" fill="${COLORS.needle}" stroke="none"/>
  </g>
</svg>`
}

function renderPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, shapeRendering: 2 })
  return resvg.render().asPng()
}

async function writeIco(relPath, sizes) {
  const layers = sizes.map((size) => renderPng(logoSvg({ bold: size <= 32 }), size))
  const ico = await pngToIco(layers)
  const target = join(root, relPath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, ico)
  process.stdout.write(`wrote ${relPath} (${sizes.join(', ')} px, ${ico.length} bytes)\n`)
}

async function main() {
  await writeIco('build/icon.ico', [16, 24, 32, 48, 64, 128, 256])
  await writeIco('resources/icons/tray.ico', [16, 20, 24, 32, 40, 48])
  const preview = join(root, 'build', 'icon.png')
  await writeFile(preview, renderPng(logoSvg({ bold: false }), 512))
  process.stdout.write('wrote build/icon.png (512 px preview)\n')
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
