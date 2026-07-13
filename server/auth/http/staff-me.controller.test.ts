import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLoginController } from './staff-login.controller'
import { staffMeController } from './staff-me.controller'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/auth/staff/me', { headers: { cookie } })
}

async function loginAndGetAccessTokenCookie(): Promise<string> {
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return accessToken
}

beforeEach(async () => {
  await cleanAuthTables()
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.create({
    data: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
})

describe('staffMeController', () => {
  it('returns the staff user for a valid access token cookie', async () => {
    const accessToken = await loginAndGetAccessTokenCookie()

    const req = requestWithCookie(`access_token=${accessToken}`)
    const res = await staffMeController(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.user).toEqual({
      id: expect.any(String),
      name: 'Admin Studio',
      email: 'admin@atlas.fit',
      role: 'ADMIN',
    })
  })

  it('returns 401 when no access token cookie is present', async () => {
    const req = requestWithCookie('')
    const res = await staffMeController(req)

    expect(res.status).toBe(401)
  })

  it('returns 401 for a malformed access token', async () => {
    const req = requestWithCookie('access_token=not-a-real-jwt')
    const res = await staffMeController(req)

    expect(res.status).toBe(401)
  })
})
