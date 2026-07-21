import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { recordVisitorSessionController } from './record-visitor.controller'

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
  return new NextRequest('https://example.com/api/sessions/visitor', {
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

describe('recordVisitorSessionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await recordVisitorSessionController(
      new NextRequest('https://example.com/api/sessions/visitor', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('records a visitor session, no eligibility check', async () => {
    const cookie = await adminCookie()

    const res = await recordVisitorSessionController(
      sessionRequest({ fullName: 'Nadia Ferrand', phoneNumber: '+33698765432', paymentMethod: 'cash' }, cookie),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.session.type).toBe('visitor')
    expect(json.data.session.fullName).toBe('Nadia Ferrand')
    expect(json.data.session.amountPaid).toBe(8)
  })

  it('returns 400 for an invalid phoneNumber', async () => {
    const cookie = await adminCookie()

    const res = await recordVisitorSessionController(
      sessionRequest({ fullName: 'Nadia Ferrand', phoneNumber: '0612345678', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(400)
  })
})
