import { describe, expect, it } from 'vitest'
import { hardenedEnv, safeSystemRoot } from './env'

describe('safeSystemRoot', () => {
  it('accepts only "<drive>:\\Windows"', () => {
    expect(safeSystemRoot({ SystemRoot: 'D:\\Windows' })).toBe('D:\\Windows')
    expect(safeSystemRoot({ SystemRoot: 'C:\\Users\\x\\fake' })).toBe('C:\\Windows')
    expect(safeSystemRoot({})).toBe('C:\\Windows')
  })
})

describe('hardenedEnv', () => {
  const env = hardenedEnv({
    SystemRoot: 'C:\\Windows',
    USERPROFILE: 'C:\\Users\\Player',
    PSModulePath: 'C:\\Users\\Player\\Documents\\WindowsPowerShell\\Modules;C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules',
    PSModuleAnalysisCachePath: 'C:\\evil',
    COR_ENABLE_PROFILING: '1',
    COR_PROFILER: '{x}',
    COMPLUS_Foo: '1',
    DOTNET_bar: '1',
    Path: 'C:\\Users\\Player\\bin;C:\\Windows\\System32',
  })

  it('pins the module path and PATH to System32', () => {
    expect(env['PSModulePath']).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules')
    expect(env['Path']?.split(';')[0]).toBe('C:\\Windows\\System32')
    expect(env['Path']).not.toContain('Users')
  })

  it('drops profiler and module-cache variables but keeps ordinary ones', () => {
    expect(env['COR_PROFILER']).toBeUndefined()
    expect(env['COR_ENABLE_PROFILING']).toBeUndefined()
    expect(env['COMPLUS_Foo']).toBeUndefined()
    expect(env['DOTNET_bar']).toBeUndefined()
    expect(env['PSModuleAnalysisCachePath']).toBeUndefined()
    expect(env['USERPROFILE']).toBe('C:\\Users\\Player')
  })
})
