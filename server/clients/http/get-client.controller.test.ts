import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { getClientController } from './get-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(): NextRequest {
  return new NextRequest('https://example.com/api/clients/x')
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('getClientController', () => {
  it('returns the client for a valid id', async () => {
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }))
    const created = (await createRes.json()).data.client

    const res = await getClientController(getRequest(), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.id).toBe(created.id)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await getClientController(getRequest(), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
