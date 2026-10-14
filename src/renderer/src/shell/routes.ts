// State-based router: the app has a fixed set of screens and no URLs.

export const ROUTE_IDS = ['dashboard', 'optimizations', 'scan', 'games', 'debloat', 'backups', 'settings'] as const

export type RouteId = (typeof ROUTE_IDS)[number]

export interface RouteDef {
  id: RouteId
  label: string
}

export const ROUTES: readonly RouteDef[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'optimizations', label: 'Optimizations' },
  { id: 'scan', label: 'System Scan' },
  { id: 'games', label: 'Games' },
  { id: 'debloat', label: 'Debloat' },
  { id: 'backups', label: 'Backups' },
  { id: 'settings', label: 'Settings' },
]

export function isRouteId(value: string): value is RouteId {
  return (ROUTE_IDS as readonly string[]).includes(value)
}
