import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from './create-or-renew.controller'

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

function postClient(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function postSubscription(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('createOrRenewSubscriptionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await createOrRenewSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('creates a subscription with server-computed amountPaid/dates, translated to lowercase in the response', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(postClient({ name: 'Marc Delaunay', phone: '+33612345699' }, cookie))
    const client = (await clientRes.json()).data.client

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: client.id, planId: 'quarterly', paymentMethod: 'card' }, cookie),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.subscription.planId).toBe('quarterly')
    expect(json.data.subscription.paymentMethod).toBe('card')
    expect(json.data.subscription.amountPaid).toBe(105)
    expect(json.data.subscription.suspended).toBe(false)
  })

  it('returns 404 when the client does not exist', async () => {
    const cookie = await adminCookie()

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: 'does-not-exist', planId: 'monthly', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid planId', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(postClient({ name: 'Marc Delaunay', phone: '+33612345698' }, cookie))
    const client = (await clientRes.json()).data.client

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: client.id, planId: 'weekly', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(400)
  })
})
