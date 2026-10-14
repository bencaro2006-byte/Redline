import { describe, expect, it } from 'vitest'
import { isTrustedInstallLocation, programFilesRoot } from './installLocation'

describe('install location', () => {
  it('derives Program Files from the system drive', () => {
    expect(programFilesRoot('C:\\Windows')).toBe('C:\\Program Files')
    expect(programFilesRoot('D:\\Windows')).toBe('D:\\Program Files')
  })

  it('accepts the installed location and rejects user-writable ones', () => {
    const root = 'C:\\Program Files'
    expect(isTrustedInstallLocation('C:\\Program Files\\Redline Optimizer\\resources', root)).toBe(true)
    expect(isTrustedInstallLocation('c:\\program files\\Redline Optimizer\\resources', root)).toBe(true)
    expect(isTrustedInstallLocation('C:\\Users\\Player\\AppData\\Local\\Temp\\2abc\\resources', root)).toBe(false)
    expect(isTrustedInstallLocation('C:\\Program Files Evil\\resources', root)).toBe(false)
    expect(isTrustedInstallLocation('C:\\Program Files\\..\\Users\\x\\resources', root)).toBe(false)
    expect(isTrustedInstallLocation('D:\\Tools\\Redline\\resources', root)).toBe(false)
  })
})
