/** Tach logo + REDLINE wordmark from the design's title bar. */
export function Logo() {
  return (
    <div className="rl-logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M4 17a8 8 0 1 1 16 0" stroke="var(--rl-text)" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17l5-6" stroke="var(--rl-accent)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.6" fill="var(--rl-accent)" />
      </svg>
      <span className="rl-logo__word">REDLINE</span>
    </div>
  )
}
