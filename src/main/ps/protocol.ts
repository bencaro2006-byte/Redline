// Pure helpers for the PowerShell stdin/stdout protocol (no electron, unit-testable).
import { z } from 'zod'

/** JSON with every non-ASCII char escaped as \uXXXX: immune to console code pages (spec §6 rule 4). */
export function toAsciiJson(value: unknown): string {
  const json = JSON.stringify(value ?? {})
  return json.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** Last non-empty stdout line, BOM stripped. Scripts write exactly one JSON line (spec §6 rule 5). */
export function lastJsonLine(stdout: string): string {
  const lines = stdout.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  return lines.at(-1) ?? ''
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

export const ScriptErrorBody = z.object({
  code: z.string().min(1).max(100),
  message: z.string().max(10_000),
})

/** The { ok:true, data } | { ok:false, error } envelope every one-shot script prints. `data` is validated separately. */
export const ScriptEnvelope = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: ScriptErrorBody }),
])

/** Splits a byte stream into complete lines; keeps the trailing partial line buffered. */
export class LineSplitter {
  private buffer = ''

  constructor(private readonly maxLineChars: number) {}

  /** Returns complete lines; throws when a single line grows past maxLineChars. */
  push(chunk: string): string[] {
    const text = this.buffer + chunk
    const parts = text.split(/\r?\n/)
    const rest = parts.pop() ?? ''
    if (rest.length > this.maxLineChars) throw new Error(`line exceeds ${this.maxLineChars} chars`)
    this.buffer = rest
    return parts.map((p) => p.replace(/^﻿/, '').trim()).filter((p) => p.length > 0)
  }

  flush(): string[] {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest.length > 0 ? [rest] : []
  }
}
