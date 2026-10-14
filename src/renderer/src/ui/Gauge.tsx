import { GAUGE_CENTER, GAUGE_RADIUS, GAUGE_START_DEG, clampPercent, gaugeTicks, trackDash, valueDash } from './gaugeGeometry'
import './gauge.css'

export interface GaugeProps {
  /** 0-100. */
  value: number
  /** Caption under the number. */
  label?: string
  /** Rendered size in px (square). */
  size?: number
  /** Accessible name, e.g. "Optimization score". */
  ariaLabel?: string
  /** Show a placeholder dash instead of the number (e.g. while loading). */
  pending?: boolean
}

const TICKS = gaugeTicks()

/** 270-degree tachometer with redline ticks (design/project/Main.dc.html). */
export function Gauge({ value, label = 'OPTIMIZED', size = 210, ariaLabel = 'Optimization score', pending = false }: GaugeProps) {
  const percent = Math.round(clampPercent(value))
  const rotate = `rotate(${GAUGE_START_DEG} ${GAUGE_CENTER} ${GAUGE_CENTER})`
  return (
    <div
      className="rl-gauge"
      style={{ width: size, height: size }}
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pending ? undefined : percent}
      aria-valuetext={pending ? 'Not measured yet' : `${percent}%`}
    >
      <svg className="rl-gauge__svg" width={size} height={size} viewBox="-12 -12 224 224" fill="none" aria-hidden="true">
        <circle
          cx={GAUGE_CENTER}
          cy={GAUGE_CENTER}
          r={GAUGE_RADIUS}
          stroke="var(--rl-hairline-2)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={trackDash()}
          transform={rotate}
        />
        {!pending && (
          <circle
            className="rl-gauge__value"
            cx={GAUGE_CENTER}
            cy={GAUGE_CENTER}
            r={GAUGE_RADIUS}
            stroke="var(--rl-accent)"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={valueDash(percent)}
            transform={rotate}
          />
        )}
        {TICKS.map((t) => (
          <line
            key={`${t.x1}-${t.y1}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.redline ? 'var(--rl-accent)' : 'var(--rl-tick)'}
            strokeWidth={t.redline ? 2.6 : 2}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="rl-gauge__readout" aria-hidden="true">
        <span className="rl-gauge__number">
          {pending ? '--' : percent}
          <span className="rl-gauge__unit">%</span>
        </span>
        <span className="rl-gauge__label">{label}</span>
      </div>
    </div>
  )
}
