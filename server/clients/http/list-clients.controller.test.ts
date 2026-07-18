// server/clients/http/list-clients.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { listClientsController } from './list-clients.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function listRequest(query: string, cookie: string): NextRequest {
  return new NextRequest(`https://example.com/api/clients${query}`, { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('listClientsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await listClientsController(new NextRequest('https://example.com/api/clients'))

    expect(res.status).toBe(401)
  })

  it('returns all active clients with a total when no query params are given', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Client One', phone: '+33600000201' }, cookie))
    await createClientController(postRequest({ name: 'Client Two', phone: '+33600000202' }, cookie))

    const res = await listClientsController(listRequest('', cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.clients).toHaveLength(2)
    expect(json.data.total).toBe(2)
  })

  it('respects page and limit query params', async () => {
    const cookie = await staffAccessTokenCookie()
    for (let i = 0; i < 3; i++) {
      await createClientController(postRequest({ name: `Paged Client ${i}`, phone: `+336000003${i}0` }, cookie))
    }

    const res = await listClientsController(listRequest('?page=1&limit=2', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(2)
    expect(json.data.total).toBe(3)
  })

  it('searches by q and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }, cookie))

    const res = await listClientsController(listRequest('?q=yasmine', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.total).toBeUndefined()
  })

  it('finds by exact phone and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))

    const res = await listClientsController(listRequest('?phone=%2B33612345602', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].phone).toBe('+33612345602')
    expect(json.data.total).toBeUndefined()
  })

  it('finds by card number and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Inès Fabre', phone: '+33612345603' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await listClientsController(listRequest(`?cardNumber=${created.cardNumber}`, cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].id).toBe(created.id)
    expect(json.data.total).toBeUndefined()
  })

  it('returns an empty list for a card number that does not exist', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await listClientsController(listRequest('?cardNumber=CARD-99999', cookie))
    const json = await res.json()

    expect(json.data.clients).toEqual([])
  })
})
