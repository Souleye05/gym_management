import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { deactivateClientController } from './deactivate-client.controller'
import { getClientController } from './get-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteRequest(): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', { method: 'DELETE' })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('deactivateClientController', () => {
  it('deactivates an existing client', async () => {
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345605' }))
    const created = (await createRes.json()).data.client

    const res = await deactivateClientController(deleteRequest(), created.id)

    expect(res.status).toBe(200)

    const getRes = await getClientController(new NextRequest('https://example.com/api/clients/x'), created.id)
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await deactivateClientController(deleteRequest(), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
