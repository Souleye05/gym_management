import { describe, expect, it } from 'vitest'
import { validateEnum } from './validate-enum'

describe('validateEnum', () => {
  it('returns the value when it is in the allowed list', () => {
    expect(validateEnum('CASH', ['CASH', 'CARD'] as const, 'paymentMethod')).toBe('CASH')
  })

  it('throws when the value is not in the allowed list', () => {
    expect(() => validateEnum('BITCOIN', ['CASH', 'CARD'] as const, 'paymentMethod')).toThrow(
      'Unexpected paymentMethod value from database: "BITCOIN"',
    )
  })
})
