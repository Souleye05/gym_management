import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('createClientController', () => {
  it('creates a client and returns 201 with a formatted card number', async () => {
    const res = await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.client.name).toBe('Yasmine Kaddour')
    expect(json.data.client.cardNumber).toMatch(/^CARD-\d{5,}$/)
    expect(json.data.client.cardSequence).toBeUndefined()
  })

  it('returns 400 for an invalid payload', async () => {
    const res = await createClientController(postRequest({ name: '', phone: '123' }))

    expect(res.status).toBe(400)
  })

  it('returns 409 when the phone is already used by an active client', async () => {
    await createClientController(postRequest({ name: 'First', phone: '+33612345601' }))

    const res = await createClientController(postRequest({ name: 'Second', phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.success).toBe(false)
  })
})
