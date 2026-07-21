import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from '../subscriptions/create-or-renew.controller'
import { recordSubscriberSessionController } from './record-subscriber.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

function sessionRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/sessions/subscriber', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
  await prismaClient.appSettings.deleteMany()
})

describe('recordSubscriberSessionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await recordSubscriberSessionController(
      new NextRequest('https://example.com/api/sessions/subscriber', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('records a session for an eligible client, amountPaid from settings default', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(
      new NextRequest('https://example.com/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Marc Delaunay', phone: '+33612345695' }),
      }),
    )
    const client = (await clientRes.json()).data.client
    await createOrRenewSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ clientId: client.id, planId: 'monthly', paymentMethod: 'cash' }),
      }),
    )

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: client.id, paymentMethod: 'cash' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.session.type).toBe('subscriber')
    expect(json.data.session.amountPaid).toBe(8)
  })

  it('returns 422 with reason "none" when the client has no subscription', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(
      new NextRequest('https://example.com/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'No Subscription', phone: '+33612345694' }),
      }),
    )
    const client = (await clientRes.json()).data.client

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: client.id, paymentMethod: 'cash' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.errors?.[0]?.message).toBe('none')
  })

  it('returns 404 when the client does not exist', async () => {
    const cookie = await adminCookie()

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: 'does-not-exist', paymentMethod: 'cash' }, cookie))

    expect(res.status).toBe(404)
  })
})
