import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { updateClientController } from './update-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('updateClientController', () => {
  it('updates the client name', async () => {
    const createRes = await createClientController(postRequest({ name: 'Original', phone: '+33612345603' }))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: 'Updated' }), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Updated')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await updateClientController(patchRequest({ name: 'X' }), 'does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid payload', async () => {
    const createRes = await createClientController(postRequest({ name: 'Valid', phone: '+33612345604' }))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: '' }), created.id)

    expect(res.status).toBe(400)
  })
})
