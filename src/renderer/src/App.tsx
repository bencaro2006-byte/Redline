import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApplyFlowProvider } from './features/apply/ApplyFlowProvider'
import { AppDataProvider, useAppData } from './features/data/AppDataProvider'
import { summarizePc } from './lib/pcSummary'
import { SCREENS } from './screens'
import { NavigationProvider } from './shell/navigation'
import { NavRail } from './shell/NavRail'
import type { RouteId } from './shell/routes'
import { StatusBanner } from './shell/StatusBanner'
import { TitleBar } from './shell/TitleBar'

function Shell() {
  const [route, setRoute] = useState<RouteId>('dashboard')
  const mainRef = useRef<HTMLElement>(null)
  const { scan } = useAppData()
  const pc = useMemo(() => (scan.data ? summarizePc(scan.data.info) : null), [scan.data])

  const navigate = useCallback((next: RouteId) => setRoute(next), [])
  const navigation = useMemo(() => ({ route, navigate }), [route, navigate])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [route])

  const Screen = SCREENS[route]
  return (
    <NavigationProvider value={navigation}>
      <div className="rl-app">
        <TitleBar />
        <NavRail route={route} onNavigate={navigate} pc={pc} />
        <main ref={mainRef} className="rl-main" id="main">
          <StatusBanner />
          <Screen key={route} />
        </main>
      </div>
    </NavigationProvider>
  )
}

export function App() {
  return (
    <AppDataProvider>
      <ApplyFlowProvider>
        <Shell />
      </ApplyFlowProvider>
    </AppDataProvider>
  )
}
