import { describe, expect, it } from 'vitest'
import { gameKey, parseGameKey } from './actions'

describe('parseGameKey', () => {
  it('round-trips keys built by gameKey, including UUID ids with dashes', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseGameKey(gameKey(id, 'highCpuPriority'))).toEqual({ gameId: id, flag: 'highCpuPriority' })
    expect(parseGameKey(gameKey('g-cs2', 'disableFullscreenOptimizations'))).toEqual({ gameId: 'g-cs2', flag: 'disableFullscreenOptimizations' })
  })

  it('rejects anything else', () => {
    expect(parseGameKey('menu-show-delay-short#0')).toBeNull()
    expect(parseGameKey('game-x-somethingElse#0')).toBeNull()
    expect(parseGameKey('game-x-gpuHighPerformance#1')).toBeNull()
  })
})
