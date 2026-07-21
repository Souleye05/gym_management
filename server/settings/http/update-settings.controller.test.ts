import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { updateSettingsController } from './update-settings.controller'

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

function patchRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.appSettings.deleteMany()
})

describe('updateSettingsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await updateSettingsController(
      new NextRequest('https://example.com/api/settings', { method: 'PATCH', body: JSON.stringify({ sessionPrice: 10 }) }),
    )

    expect(res.status).toBe(401)
  })

  it('returns 403 when the staff member is an AGENT, not ADMIN', async () => {
    const cookie = await staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')

    const res = await updateSettingsController(patchRequest({ sessionPrice: 10 }, cookie))

    expect(res.status).toBe(403)
  })

  it('updates sessionPrice when the staff member is ADMIN', async () => {
    const cookie = await staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')

    const res = await updateSettingsController(patchRequest({ sessionPrice: 12 }, cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.settings.sessionPrice).toBe(12)
  })

  it('returns 400 for an invalid sessionPrice', async () => {
    const cookie = await staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')

    const res = await updateSettingsController(patchRequest({ sessionPrice: -5 }, cookie))

    expect(res.status).toBe(400)
  })
})
