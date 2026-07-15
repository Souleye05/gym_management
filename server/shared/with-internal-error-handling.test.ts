import { NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { withInternalErrorHandling } from './with-internal-error-handling'

describe('withInternalErrorHandling', () => {
  it('returns the handler result unchanged on success', async () => {
    const response = await withInternalErrorHandling(async () => NextResponse.json({ ok: true }, { status: 200 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('converts a thrown internal-error into a 500 with a generic body, without leaking the cause', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await withInternalErrorHandling(async () => {
      throw new Error('internal-error')
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ success: false, data: null, message: 'internal-error', errors: null })

    consoleErrorSpy.mockRestore()
  })

  it('also converts an unrelated thrown error into the same generic 500 shape', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await withInternalErrorHandling(async () => {
      throw new Error('relation "clients" violates constraint xyz_pk')
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.message).toBe('internal-error')
    expect(JSON.stringify(json)).not.toContain('constraint')

    consoleErrorSpy.mockRestore()
  })
})
