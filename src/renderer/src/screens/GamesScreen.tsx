// Games: per-game Windows settings (GPU preference, fullscreen optimizations, CPU priority).
import { useCallback, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { GameProfile } from '@shared/types'
import { NvidiaChecklist } from '../features/NvidiaChecklist'
import { useApi } from '../lib/api'
import { useResult } from '../lib/useResult'
import { GamepadIcon } from '../shell/icons'
import { useAppStatus } from '../shell/appStatus'
import { Button, Card, EmptyState, Modal, Page, PageHeader, Skeleton, Toggle, useToast } from '../ui'
import './games.css'

type Flag = 'gpuHighPerformance' | 'disableFullscreenOptimizations' | 'highCpuPriority'

const FLAGS: readonly { flag: Flag; label: string; help: string }[] = [
  {
    flag: 'gpuHighPerformance',
    label: 'High-performance GPU',
    help: 'Tells Windows to run this game on the GTX 1070. It matters most when the Intel graphics are also enabled.',
  },
  {
    flag: 'disableFullscreenOptimizations',
    label: 'Fullscreen optimizations off',
    help: 'Uses classic exclusive fullscreen. Some older DirectX 11 games feel more responsive; no effect in borderless mode.',
  },
  {
    flag: 'highCpuPriority',
    label: 'High CPU priority',
    help: 'Starts the game at High priority. Can help when apps run in the background; some anti-cheat games ignore or block it.',
  },
]

function GameCard({ game, busy, onToggle, onRemove }: { game: GameProfile; busy: boolean; onToggle: (game: GameProfile, flag: Flag, next: boolean) => void; onRemove: (game: GameProfile) => void }) {
  return (
    <Card className="rl-game" title={game.exeName} actions={<Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy} onClick={() => onRemove(game)} aria-label={`Remove ${game.exeName}`}>Remove</Button>}>
      <p className="rl-game__path rl-mono rl-selectable" title={game.exePath}>
        {game.exePath}
      </p>
      <ul className="rl-game__flags">
        {FLAGS.map(({ flag, label, help }) => {
          const helpId = `${game.id}-${flag}-help`
          return (
            <li key={flag} className="rl-game__flag">
              <div className="rl-game__flag-text">
                <span className="rl-game__flag-label">{label}</span>
                <span id={helpId} className="rl-game__flag-help">
                  {help}
                </span>
              </div>
              <Toggle checked={game[flag]} label={`${label} for ${game.exeName}`} describedBy={helpId} disabled={busy} onChange={(next) => onToggle(game, flag, next)} />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function GamesScreen() {
  const api = useApi()
  const toast = useToast()
  const { status } = useAppStatus()
  const loadGames = useCallback(() => api.listGames(), [api])
  const { state, reload } = useResult(loadGames)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<GameProfile | null>(null)

  const add = (): void => {
    setAdding(true)
    api
      .addGame()
      .then((result) => {
        if (!result.ok) toast.show({ title: 'Could not add the game', message: result.error.message, tone: 'error' })
        else if (result.data !== null) {
          toast.show({ title: `${result.data.exeName} added`, tone: 'ok' })
          reload()
        }
      })
      .finally(() => setAdding(false))
  }

  const toggle = (game: GameProfile, flag: Flag, next: boolean): void => {
    setBusyId(game.id)
    api
      .updateGame({ id: game.id, gpuHighPerformance: game.gpuHighPerformance, disableFullscreenOptimizations: game.disableFullscreenOptimizations, highCpuPriority: game.highCpuPriority, [flag]: next })
      .then((result) => {
        if (!result.ok) toast.show({ title: 'Could not change the setting', message: result.error.message, tone: 'error' })
        else if (status?.dryRun) toast.show({ title: 'Dry run: nothing was changed', message: 'Turn off dry run in Settings to apply game settings.', tone: 'info' })
        reload()
      })
      .finally(() => setBusyId(null))
  }

  const confirmRemove = (): void => {
    if (removing === null) return
    const game = removing
    setRemoving(null)
    setBusyId(game.id)
    api
      .removeGame({ id: game.id })
      .then((result) => {
        if (!result.ok) toast.show({ title: 'Could not remove the game', message: result.error.message, tone: 'error' })
        else toast.show({ title: status?.dryRun ? `Dry run: ${game.exeName} was kept` : `${game.exeName} removed and its settings reverted`, tone: status?.dryRun ? 'info' : 'ok' })
        reload()
      })
      .finally(() => setBusyId(null))
  }

  const games = state.data ?? []

  return (
    <Page label="Games">
      <PageHeader
        title="Games"
        eyebrow="Per-game Windows settings"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} loading={adding} onClick={add}>
            Add game
          </Button>
        }
      />
      {state.status === 'error' && <EmptyState tone="error" title="Could not load your games" message={state.error?.message} />}
      {state.data === null && state.status === 'loading' && (
        <div className="rl-games__grid" aria-busy="true">
          <Card>
            <Skeleton height={22} width="40%" />
            <Skeleton height={120} />
          </Card>
        </div>
      )}
      {state.data !== null && games.length === 0 && (
        <EmptyState
          icon={<GamepadIcon size={26} />}
          title="No games yet"
          message="Add a game's .exe to choose its GPU, fullscreen and CPU priority settings. Every change is backed up and undone when you remove the game."
          action={
            <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
              Add game
            </Button>
          }
        />
      )}
      {games.length > 0 && (
        <div className="rl-games__grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} busy={busyId !== null} onToggle={toggle} onRemove={setRemoving} />
          ))}
        </div>
      )}
      <NvidiaChecklist />
      <Modal
        open={removing !== null}
        title={`Remove ${removing?.exeName ?? ''}?`}
        description="Its game settings are reverted first, then it is removed from the list."
        onClose={() => setRemoving(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      />
    </Page>
  )
}
