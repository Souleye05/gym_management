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
import { suspendSubscriptionController } from './suspend.controller'

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

async function createSubscription(cookie: string, phone: string): Promise<string> {
  const clientRes = await createClientController(
    new NextRequest('https://example.com/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Test Client', phone }),
    }),
  )
  const client = (await clientRes.json()).data.client
  const subRes = await createOrRenewSubscriptionController(
    new NextRequest('https://example.com/api/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientId: client.id, planId: 'monthly', paymentMethod: 'cash' }),
    }),
  )
  return (await subRes.json()).data.subscription.id
}

function suspendRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/subscriptions/x/suspend', { method: 'PATCH', headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('suspendSubscriptionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await suspendSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions/x/suspend', { method: 'PATCH' }),
      'some-id',
    )

    expect(res.status).toBe(401)
  })

  it('suspends an existing subscription', async () => {
    const cookie = await adminCookie()
    const subscriptionId = await createSubscription(cookie, '+33612345697')

    const res = await suspendSubscriptionController(suspendRequest(cookie), subscriptionId)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.subscription.suspended).toBe(true)
  })

  it('returns 404 for an unknown subscription id', async () => {
    const cookie = await adminCookie()

    const res = await suspendSubscriptionController(suspendRequest(cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
