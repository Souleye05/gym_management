// server/clients/http/get-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { deactivateClientController } from './deactivate-client.controller'
import { getClientController } from './get-client.controller'

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

function getRequest(cookie: string, query = ''): NextRequest {
  return new NextRequest(`https://example.com/api/clients/x${query}`, { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('getClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await getClientController(new NextRequest('https://example.com/api/clients/x'), 'some-id')

    expect(res.status).toBe(401)
  })

  it('returns the client for a valid id', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await getClientController(getRequest(cookie), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.id).toBe(created.id)
  })

  it('returns 404 for an unknown id', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await getClientController(getRequest(cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 404 for a deactivated client by default', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))
    const created = (await createRes.json()).data.client
    await deactivateClientController(getRequest(cookie), created.id)

    const res = await getClientController(getRequest(cookie), created.id)

    expect(res.status).toBe(404)
  })

  it('returns a deactivated client when ?includeInactive=true is passed', async () => {
    // Lets a deactivated client's own historical records (e.g. past sessions) still resolve
    // their name — deactivation must not make the underlying data unreachable everywhere.
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))
    const created = (await createRes.json()).data.client
    await deactivateClientController(getRequest(cookie), created.id)

    const res = await getClientController(getRequest(cookie, '?includeInactive=true'), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.id).toBe(created.id)
    expect(json.data.client.isActive).toBe(false)
  })
})
