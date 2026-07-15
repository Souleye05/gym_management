import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { listClientsController } from './list-clients.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function listRequest(query: string): NextRequest {
  return new NextRequest(`https://example.com/api/clients${query}`)
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('listClientsController', () => {
  it('returns an empty list with no query params', async () => {
    const res = await listClientsController(listRequest(''))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.clients).toEqual([])
  })

  it('searches by q', async () => {
    await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }))

    const res = await listClientsController(listRequest('?q=yasmine'))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
  })

  it('finds by exact phone', async () => {
    await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }))

    const res = await listClientsController(listRequest('?phone=%2B33612345602'))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].phone).toBe('+33612345602')
  })

  it('finds by card number', async () => {
    const createRes = await createClientController(postRequest({ name: 'Inès Fabre', phone: '+33612345603' }))
    const created = (await createRes.json()).data.client

    const res = await listClientsController(listRequest(`?cardNumber=${created.cardNumber}`))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].id).toBe(created.id)
  })

  it('returns an empty list for a card number that does not exist', async () => {
    const res = await listClientsController(listRequest('?cardNumber=CARD-99999'))
    const json = await res.json()

    expect(json.data.clients).toEqual([])
  })
})
