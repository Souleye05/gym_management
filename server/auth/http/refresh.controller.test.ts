import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLoginController } from './staff-login.controller'
import { clientRequestOtpController } from './client-request-otp.controller'
import { clientVerifyOtpController } from './client-verify-otp.controller'
import { refreshController } from './refresh.controller'

const SIMULATED_OTP_CODE = '123456'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/auth/refresh', { method: 'POST', headers: { cookie } })
}

async function staffLoginAndGetRefreshTokenCookie(): Promise<string> {
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const refreshToken = res.cookies.get('refresh_token')?.value
  if (!refreshToken) throw new Error('login did not set a refresh token cookie')
  return refreshToken
}

async function clientVerifyAndGetRefreshTokenCookie(phone: string): Promise<string> {
  const requestOtpReq = new NextRequest('https://example.com/api/auth/client/request-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  await clientRequestOtpController(requestOtpReq)

  const verifyReq = new NextRequest('https://example.com/api/auth/client/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: SIMULATED_OTP_CODE }),
  })
  const res = await clientVerifyOtpController(verifyReq)
  const refreshToken = res.cookies.get('refresh_token')?.value
  if (!refreshToken) throw new Error('verify-otp did not set a refresh token cookie')
  return refreshToken
}

beforeEach(async () => {
  await cleanAuthTables()
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.create({
    data: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
})

describe('refreshController', () => {
  it('rotates a staff refresh token', async () => {
    const refreshToken = await staffLoginAndGetRefreshTokenCookie()

    const res = await refreshController(requestWithCookie(`refresh_token=${refreshToken}`))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const newRefreshToken = res.cookies.get('refresh_token')?.value
    expect(newRefreshToken).toBeTruthy()
    expect(newRefreshToken).not.toBe(refreshToken)
  })

  it('rotates a client refresh token by delegating to the client service', async () => {
    const refreshToken = await clientVerifyAndGetRefreshTokenCookie('+33612345601')

    const res = await refreshController(requestWithCookie(`refresh_token=${refreshToken}`))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const newRefreshToken = res.cookies.get('refresh_token')?.value
    expect(newRefreshToken).toBeTruthy()
    expect(newRefreshToken).not.toBe(refreshToken)
  })

  it('returns 401 for an unknown refresh token', async () => {
    const res = await refreshController(requestWithCookie('refresh_token=never-issued'))

    expect(res.status).toBe(401)
  })

  it('returns 401 when no refresh token cookie is present', async () => {
    const res = await refreshController(requestWithCookie(''))

    expect(res.status).toBe(401)
  })
})
