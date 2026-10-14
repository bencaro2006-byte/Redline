import { ROUTE_ICONS } from './icons'
import { ROUTES, type RouteId } from './routes'

export interface PcSummary {
  /** e.g. "i7-7700 · GTX 1070" */
  headline: string
  /** e.g. "32 GB · MX500 1 TB · Win10 22H2" */
  detail: string
}

export interface NavRailProps {
  route: RouteId
  onNavigate: (route: RouteId) => void
  /** "THIS PC" card at the bottom; hidden until a scan is available. */
  pc: PcSummary | null
}

export function NavRail({ route, onNavigate, pc }: NavRailProps) {
  return (
    <nav className="rl-nav" aria-label="Main">
      <ul className="rl-nav__list">
        {ROUTES.map((r) => {
          const Icon = ROUTE_ICONS[r.id]
          const active = r.id === route
          return (
            <li key={r.id}>
              <button
                type="button"
                className={`rl-nav__item${active ? ' rl-nav__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(r.id)}
              >
                <Icon className="rl-nav__icon" />
                {r.label}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="rl-nav__spacer" />
      {pc !== null && (
        <div className="rl-nav__pc">
          <span className="rl-nav__pc-eyebrow">THIS PC</span>
          <span className="rl-nav__pc-headline">{pc.headline}</span>
          <span className="rl-nav__pc-detail rl-mono">{pc.detail}</span>
        </div>
      )}
    </nav>
  )
}
