import { createContext, useContext, type ReactNode } from 'react'
import type { RouteId } from './routes'

export interface Navigation {
  route: RouteId
  navigate: (route: RouteId) => void
}

const NavigationContext = createContext<Navigation | null>(null)

export function NavigationProvider({ value, children }: { value: Navigation; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

/** Current route and navigate() for screens (e.g. Dashboard "Review list" -> optimizations). */
export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext)
  if (nav === null) throw new Error('useNavigation must be used inside <NavigationProvider>')
  return nav
}
