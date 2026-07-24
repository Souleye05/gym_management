import type { KpiValue } from './entities'

/**
 * `previous === 0` has no mathematically defined percentage change. Convention: +100% if `current`
 * grew from nothing, 0% if both are zero — never `Infinity`/`NaN`, which would break JSON
 * serialization and any frontend arithmetic on the value.
 */
export function deriveKpiDelta(current: number, previous: number): Omit<KpiValue, 'value'> {
  if (previous === 0) {
    return { deltaPercent: current > 0 ? 100 : 0, trend: 'up' }
  }
  const deltaPercent = Math.round(((current - previous) / previous) * 1000) / 10
  return { deltaPercent, trend: deltaPercent >= 0 ? 'up' : 'down' }
}
