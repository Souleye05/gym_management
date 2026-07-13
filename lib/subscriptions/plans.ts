import type { Plan } from './types'

export const PLANS: Plan[] = [
  { id: 'monthly', label: 'Mensuel', durationDays: 30, price: 40 },
  { id: 'quarterly', label: 'Trimestriel', durationDays: 90, price: 105 },
  { id: 'biannual', label: 'Semestriel', durationDays: 180, price: 190 },
  { id: 'annual', label: 'Annuel', durationDays: 365, price: 350 },
]
