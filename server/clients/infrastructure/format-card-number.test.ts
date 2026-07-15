import { describe, expect, it } from 'vitest'
import { formatCardNumber, parseCardNumber } from './format-card-number'

describe('formatCardNumber', () => {
  it('formats a sequence as a zero-padded 5-digit card number', () => {
    expect(formatCardNumber(1)).toBe('CARD-00001')
  })

  it('formats a large sequence without truncating', () => {
    expect(formatCardNumber(123456)).toBe('CARD-123456')
  })
})

describe('parseCardNumber', () => {
  it('parses a well-formed card number back to its sequence', () => {
    expect(parseCardNumber('CARD-00001')).toBe(1)
  })

  it('parses a large card number', () => {
    expect(parseCardNumber('CARD-123456')).toBe(123456)
  })

  it('returns null for a missing prefix', () => {
    expect(parseCardNumber('00001')).toBeNull()
  })

  it('returns null for a non-numeric suffix', () => {
    expect(parseCardNumber('CARD-abcde')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseCardNumber('')).toBeNull()
  })

  it('round-trips formatCardNumber output', () => {
    expect(parseCardNumber(formatCardNumber(42))).toBe(42)
  })
})
