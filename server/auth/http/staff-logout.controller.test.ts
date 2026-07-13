import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLogoutController } from './staff-logout.controller'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/auth/staff/logout', {
    method: 'POST',
    headers: { cookie },
  })
}

beforeEach(async () => {
  await cleanAuthTables()
})

describe('staffLogoutController', () => {
  it('revokes the refresh token and clears cookies', async () => {
    const staff = await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })
    const rawToken = 'raw-refresh-token'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await prismaClient.refreshToken.create({
      data: { tokenHash, staffAccountId: staff.id, expiresAt: new Date(Date.now() + 60_000) },
    })

    const req = requestWithCookie(`refresh_token=${rawToken}`)
    const res = await staffLogoutController(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(res.cookies.get('access_token')?.value).toBe('')
    expect(res.cookies.get('refresh_token')?.value).toBe('')

    const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash } })
    expect(stored?.revokedAt).not.toBeNull()
  })

  it('succeeds and clears cookies even without a refresh token cookie', async () => {
    const req = requestWithCookie('')
    const res = await staffLogoutController(req)

    expect(res.status).toBe(200)
    expect(res.cookies.get('access_token')?.value).toBe('')
    expect(res.cookies.get('refresh_token')?.value).toBe('')
  })
})
