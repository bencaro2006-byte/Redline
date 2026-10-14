// Supported platform: Windows 10 20H1 (build 19041) or newer, x64.
import { release } from 'node:os'

export const MIN_WINDOWS_BUILD = 19041

export function windowsBuild(osRelease: string = release()): number | null {
  const build = Number(osRelease.split('.')[2])
  return Number.isInteger(build) ? build : null
}

export function isSupportedPlatform(): boolean {
  const build = windowsBuild()
  return process.platform === 'win32' && process.arch === 'x64' && build !== null && build >= MIN_WINDOWS_BUILD
}
