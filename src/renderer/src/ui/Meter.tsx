import { clampPercent } from './gaugeGeometry'
import './meter.css'

export interface MeterProps {
  label: string
  /** 0-100 fill; null renders an empty track with "n/a" semantics. */
  percent: number | null
  /** Text on the right, e.g. "9.8 / 32 GB". */
  valueText: string
  tone?: 'data' | 'accent'
}

/** Labelled horizontal bar (the LIVE panel rows on the dashboard). */
export function Meter({ label, percent, valueText, tone = 'data' }: MeterProps) {
  const fill = percent === null ? 0 : clampPercent(percent)
  return (
    <div className="rl-meter">
      <div className="rl-meter__head">
        <span className="rl-meter__label">{label}</span>
        <span className="rl-meter__value rl-mono">{valueText}</span>
      </div>
      <div
        className="rl-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(fill)}
        aria-valuetext={valueText}
      >
        <div className={`rl-meter__fill rl-meter__fill--${tone}`} style={{ transform: `scaleX(${fill / 100})` }} />
      </div>
    </div>
  )
}
