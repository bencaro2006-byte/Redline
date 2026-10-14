// Recommended NVIDIA Control Panel settings for the GTX 1070. Redline does not change
// driver settings itself; it lists them and opens the panel.
import { ExternalLink } from 'lucide-react'
import { useApi } from '../lib/api'
import { Button, Card } from '../ui'
import { useToast } from '../ui'
import './nvidia.css'

const SETTINGS: readonly { name: string; value: string; why: string }[] = [
  { name: 'Power management mode', value: 'Prefer maximum performance', why: 'Stops the GPU from dropping clocks between frames in lighter games.' },
  { name: 'Low Latency Mode', value: 'On', why: 'Limits queued frames to one. Try Ultra in GPU-bound games and keep whichever feels better.' },
  { name: 'Texture filtering - Quality', value: 'High performance', why: 'A small gain with little visible difference.' },
  { name: 'Vertical sync', value: 'Off (or Use the 3D application setting)', why: 'Avoids V-Sync input lag; cap FPS in-game or use G-SYNC instead.' },
  { name: 'Shader Cache Size', value: 'Driver Default', why: 'Keeps compiled shaders so games stutter less after the first run.' },
]

export function NvidiaChecklist({ className }: { className?: string }) {
  const api = useApi()
  const toast = useToast()
  const open = (): void => {
    api
      .openNvidiaControlPanel()
      .then((result) => {
        if (!result.ok) toast.show({ title: 'Could not open the NVIDIA Control Panel', message: result.error.message, tone: 'error' })
      })
      .catch((err: unknown) => toast.show({ title: 'Could not open the NVIDIA Control Panel', message: String(err), tone: 'error' }))
  }
  return (
    <Card
      title="NVIDIA Control Panel checklist"
      eyebrow="GeForce GTX 1070 · Manage 3D settings › Global"
      className={className}
      actions={
        <Button size="sm" icon={<ExternalLink size={14} />} onClick={open}>
          Open panel
        </Button>
      }
    >
      <p className="rl-nv__intro">Driver settings live in NVIDIA's own panel. Set these once under Global Settings; per-game profiles can override them.</p>
      <dl className="rl-nv__list">
        {SETTINGS.map((s) => (
          <div key={s.name} className="rl-nv__row">
            <dt className="rl-nv__name">{s.name}</dt>
            <dd className="rl-nv__value">{s.value}</dd>
            <dd className="rl-nv__why">{s.why}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
