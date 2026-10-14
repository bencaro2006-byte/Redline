// Route -> screen component map used by App. OWNER: UI agent (keep the keys).
import type { ComponentType } from 'react'
import type { RouteId } from '../shell/routes'
import { BackupsScreen } from './BackupsScreen'
import { DashboardScreen } from './DashboardScreen'
import { DebloatScreen } from './DebloatScreen'
import { GamesScreen } from './GamesScreen'
import { OptimizationsScreen } from './OptimizationsScreen'
import { ScanScreen } from './ScanScreen'
import { SettingsScreen } from './SettingsScreen'

export const SCREENS: Readonly<Record<RouteId, ComponentType>> = {
  dashboard: DashboardScreen,
  optimizations: OptimizationsScreen,
  scan: ScanScreen,
  games: GamesScreen,
  debloat: DebloatScreen,
  backups: BackupsScreen,
  settings: SettingsScreen,
}
