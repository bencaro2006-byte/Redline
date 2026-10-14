// Pure hardware helpers shared by main (health checks) and renderer (scan screen).
// No runtime dependencies.

/** Rated speed from a memory module part number: "KF3200C16D4/16GX" -> 3200, "DDR4-3600" -> 3600. */
export function ratedSpeedFromPartNumber(partNumber: string): number | null {
  const match = /(?:^|[^0-9])([1-9]\d{3})C\d{2}/i.exec(partNumber) ?? /DDR\d-?([1-9]\d{3})/i.exec(partNumber)
  const speed = match?.[1] !== undefined ? Number(match[1]) : null
  return speed !== null && speed >= 1600 && speed <= 9600 ? speed : null
}
