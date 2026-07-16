// server/clients/http/update-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { updateClientController } from './update-client.controller'

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

function patchRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('updateClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const req = new NextRequest('https://example.com/api/clients/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })

    const res = await updateClientController(req, 'some-id')

    expect(res.status).toBe(401)
  })

  it('updates the client name', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Original', phone: '+33612345603' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: 'Updated' }, cookie), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Updated')
  })

  it('returns 404 for an unknown id', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await updateClientController(patchRequest({ name: 'X' }, cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid payload', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Valid', phone: '+33612345604' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: '' }, cookie), created.id)

    expect(res.status).toBe(400)
  })
})
