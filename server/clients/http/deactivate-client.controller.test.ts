// server/clients/http/deactivate-client.controller.test.ts
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

async function staffAccessTokenCookie(email: string, password: string, role: 'ADMIN' | 'AGENT'): Promise<string> {
  const passwordHash = await argon2.hash(password)
  await prismaClient.staffAccount.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: 'Staff', role },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function adminCookie(): Promise<string> {
  return staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')
}

function agentCookie(): Promise<string> {
  return staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function deleteRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', { method: 'DELETE', headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('deactivateClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await deactivateClientController(new NextRequest('https://example.com/api/clients/x', { method: 'DELETE' }), 'some-id')

    expect(res.status).toBe(401)
  })

  it('returns 403 when the staff member is an AGENT, not ADMIN', async () => {
    const admin = await adminCookie()
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345605' }, admin))
    const created = (await createRes.json()).data.client

    const agent = await agentCookie()
    const res = await deactivateClientController(deleteRequest(agent), created.id)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.success).toBe(false)
  })

  it('deactivates an existing client when the staff member is ADMIN', async () => {
    const admin = await adminCookie()
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345606' }, admin))
    const created = (await createRes.json()).data.client

    const res = await deactivateClientController(deleteRequest(admin), created.id)

    expect(res.status).toBe(200)

    const getRes = await getClientController(new NextRequest('https://example.com/api/clients/x', { headers: { cookie: admin } }), created.id)
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for an unknown id when the staff member is ADMIN', async () => {
    const admin = await adminCookie()

    const res = await deactivateClientController(deleteRequest(admin), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
