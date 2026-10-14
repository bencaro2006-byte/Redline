// Display labels shared by screens (pure).
import type { Category } from '@shared/catalog'
import type { TweakStateKind } from '@shared/types'

export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  power: 'Power',
  scheduling: 'Scheduling',
  gpu: 'GPU',
  gaming: 'Gaming',
  input: 'Input',
  visual: 'Visual',
  network: 'Network',
  storage: 'Storage',
  privacy: 'Privacy',
  services: 'Services',
  debloat: 'Debloat',
}

export const STATE_LABEL: Readonly<Record<TweakStateKind, string>> = {
  applied: 'Active',
  'not-applied': 'Not active',
  partial: 'Partly active',
  'not-applicable': 'Not on this PC',
  unknown: 'Unknown',
}
