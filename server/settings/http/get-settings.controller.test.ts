import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { getSettingsController } from './get-settings.controller'

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

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.appSettings.deleteMany()
})

describe('getSettingsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await getSettingsController(new NextRequest('https://example.com/api/settings'))

    expect(res.status).toBe(401)
  })

  it('returns the settings for an AGENT (read is open to all staff)', async () => {
    const cookie = await staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')

    const res = await getSettingsController(new NextRequest('https://example.com/api/settings', { headers: { cookie } }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.settings.sessionPrice).toBe(8)
  })
})
