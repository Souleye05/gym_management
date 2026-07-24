import { describe, expect, it } from 'vitest'
import { deriveKpiDelta } from './derive-kpi-delta'

describe('deriveKpiDelta', () => {
  it('computes a positive percentage change', () => {
    expect(deriveKpiDelta(120, 100)).toEqual({ deltaPercent: 20, trend: 'up' })
  })

  it('computes a negative percentage change', () => {
    expect(deriveKpiDelta(80, 100)).toEqual({ deltaPercent: -20, trend: 'down' })
  })

  it('treats a zero-to-positive change as +100%, not Infinity', () => {
    expect(deriveKpiDelta(50, 0)).toEqual({ deltaPercent: 100, trend: 'up' })
  })

  it('treats a zero-to-zero change as 0%, not NaN', () => {
    expect(deriveKpiDelta(0, 0)).toEqual({ deltaPercent: 0, trend: 'up' })
  })

  it('rounds to one decimal place', () => {
    expect(deriveKpiDelta(103, 97)).toEqual({ deltaPercent: 6.2, trend: 'up' })
  })

  it('treats an unchanged nonzero value as 0%, trend up', () => {
    expect(deriveKpiDelta(50, 50)).toEqual({ deltaPercent: 0, trend: 'up' })
  })
})
