// Display formatting helpers (pure).

const GIB = 1024 ** 3

/** Bytes as binary GB with one decimal, e.g. 10522669875 -> "9.8 GB". */
export function formatGB(bytes: number, digits = 1): string {
  return `${(bytes / GIB).toFixed(digits)} GB`
}

/** "used / total GB" with whole totals, e.g. "9.8 / 32 GB". */
export function formatUsage(usedBytes: number, totalBytes: number): string {
  return `${(usedBytes / GIB).toFixed(1)} / ${Math.round(totalBytes / GIB)} GB`
}

/** Disk sizes use decimal units like Windows' marketing size: 1000204886016 -> "1 TB". */
export function formatDiskSize(bytes: number): string {
  const tb = bytes / 1e12
  if (tb >= 1) return `${Number(tb.toFixed(tb >= 10 ? 0 : 1))} TB`
  return `${Math.round(bytes / 1e9)} GB`
}

export function formatGHz(mhz: number | null): string {
  return mhz === null ? 'n/a' : `${(mhz / 1000).toFixed(2)} GHz`
}

export function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value)}%`
}

/** "today 14:02", "yesterday 09:10" or "12 Mar 14:02". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  if (date.getTime() >= startOfToday) return `today ${time}`
  if (date.getTime() >= startOfToday - day) return `yesterday ${time}`
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
}
