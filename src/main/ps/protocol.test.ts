import { describe, expect, it } from 'vitest'
import { lastJsonLine, LineSplitter, ScriptEnvelope, toAsciiJson, tryParseJson } from './protocol'

describe('toAsciiJson', () => {
  it('escapes every non-ASCII character', () => {
    const json = toAsciiJson({ name: 'שלום ü' })
    expect(/^[\x00-\x7e]*$/.test(json)).toBe(true)
    expect(JSON.parse(json)).toEqual({ name: 'שלום ü' })
  })

  it('sends {} for undefined input', () => {
    expect(toAsciiJson(undefined)).toBe('{}')
  })
})

describe('lastJsonLine', () => {
  it('returns the last non-empty line and strips a BOM', () => {
    expect(lastJsonLine('﻿noise\r\n{"ok":true,"data":1}\r\n\r\n')).toBe('{"ok":true,"data":1}')
    expect(lastJsonLine('')).toBe('')
  })
})

describe('ScriptEnvelope', () => {
  it('accepts success and failure envelopes', () => {
    expect(ScriptEnvelope.safeParse({ ok: true, data: { a: 1 } }).success).toBe(true)
    expect(ScriptEnvelope.safeParse({ ok: false, error: { code: 'X', message: 'y' } }).success).toBe(true)
    expect(ScriptEnvelope.safeParse({ ok: false }).success).toBe(false)
  })

  it('tryParseJson reports invalid JSON without throwing', () => {
    expect(tryParseJson('{').ok).toBe(false)
  })
})

describe('LineSplitter', () => {
  it('buffers partial lines across chunks', () => {
    const splitter = new LineSplitter(100)
    expect(splitter.push('{"a":1}\r\n{"b"')).toEqual(['{"a":1}'])
    expect(splitter.push(':2}\n')).toEqual(['{"b":2}'])
    expect(splitter.flush()).toEqual([])
  })

  it('throws when one line exceeds the limit', () => {
    const splitter = new LineSplitter(4)
    expect(() => splitter.push('123456')).toThrow()
  })
})
