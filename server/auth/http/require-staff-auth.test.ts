import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLoginController } from './staff-login.controller'
import { requireStaffAuth } from './require-staff-auth'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', { headers: { cookie } })
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

describe('requireStaffAuth', () => {
  it('returns the authenticated staff for a valid access token cookie', async () => {
    const accessToken = await loginAndGetAccessTokenCookie()

    const result = await requireStaffAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.staff).toEqual({
        id: expect.any(String),
        name: 'Admin Studio',
        email: 'admin@atlas.fit',
        role: 'ADMIN',
      })
    }
  })

  it('returns a 401 response when no access token cookie is present', async () => {
    const result = await requireStaffAuth(requestWithCookie(''))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response for a malformed access token', async () => {
    const result = await requireStaffAuth(requestWithCookie('access_token=not-a-real-jwt'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response when the staff account has been deactivated', async () => {
    const accessToken = await loginAndGetAccessTokenCookie()
    await prismaClient.staffAccount.update({ where: { email: 'admin@atlas.fit' }, data: { isActive: false } })

    const result = await requireStaffAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})
