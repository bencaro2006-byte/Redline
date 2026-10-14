import type { CSSProperties } from 'react'
import './skeleton.css'

export interface SkeletonProps {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  className?: string
}

/** Loading placeholder block. Decorative: pair it with an aria-busy container. */
export function Skeleton({ width = '100%', height = 14, radius = 6, className }: SkeletonProps) {
  return <span className={`rl-skeleton${className ? ` ${className}` : ''}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className="rl-skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  )
}
