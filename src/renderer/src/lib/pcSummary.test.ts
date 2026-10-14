import { describe, expect, it } from 'vitest'
import { formatDiskSize, formatUsage } from './format'
import { shortCpuName, shortDiskModel, shortGpuName, shortOsName } from './pcSummary'

describe('hardware labels', () => {
  it('shortens CPU, GPU and disk names', () => {
    expect(shortCpuName('Intel(R) Core(TM) i7-7700 CPU @ 3.60GHz')).toBe('i7-7700')
    expect(shortGpuName('NVIDIA GeForce GTX 1070')).toBe('GTX 1070')
    expect(shortDiskModel('CT1000MX500SSD1')).toBe('MX500')
    expect(shortDiskModel('Some Disk')).toBe('Some Disk')
  })

  it('names the OS by build', () => {
    expect(shortOsName({ caption: 'Microsoft Windows 10 Pro', version: '10.0.19045', build: '19045', displayVersion: '22H2' })).toBe('Win10 22H2')
    expect(shortOsName({ caption: 'Microsoft Windows 11 Pro', version: '10.0.22631', build: '22631', displayVersion: null })).toBe('Win11')
  })

  it('formats sizes the way the design shows them', () => {
    expect(formatDiskSize(1_000_204_886_016)).toBe('1 TB')
    expect(formatUsage(9.8 * 1024 ** 3, 32 * 1024 ** 3)).toBe('9.8 / 32 GB')
  })
})
