import { describe, expect, it } from 'vitest'
import { CreateClientSchema, UpdateClientSchema } from './client.dto'

describe('CreateClientSchema', () => {
  it('accepts a valid payload with all fields', () => {
    const result = CreateClientSchema.safeParse({ name: 'Yasmine Kaddour', phone: '+33612345601', email: 'y@example.com' })
    expect(result.success).toBe(true)
  })

  it('accepts a valid payload without email', () => {
    const result = CreateClientSchema.safeParse({ name: 'Marc Delaunay', phone: '+33612345602' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = CreateClientSchema.safeParse({ name: '', phone: '+33612345601' })
    expect(result.success).toBe(false)
  })

  it('rejects a phone that is too short', () => {
    const result = CreateClientSchema.safeParse({ name: 'Test', phone: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid email when provided', () => {
    const result = CreateClientSchema.safeParse({ name: 'Test', phone: '+33612345601', email: 'not-an-email' })
    expect(result.success).toBe(false)
  })
})

describe('UpdateClientSchema', () => {
  it('accepts a partial payload with a single field', () => {
    const result = UpdateClientSchema.safeParse({ name: 'New Name' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object (no-op update)', () => {
    const result = UpdateClientSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts email set to null to clear it', () => {
    const result = UpdateClientSchema.safeParse({ email: null })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name if name is provided', () => {
    const result = UpdateClientSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})
