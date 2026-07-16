import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from './client-request-otp.controller'
import { clientVerifyOtpController } from './client-verify-otp.controller'
import { requireClientAuth } from './require-client-auth'

const SIMULATED_OTP_CODE = '123456'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/client/me/profile', { headers: { cookie } })
}

async function verifyAndGetAccessTokenCookie(phone: string): Promise<string> {
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
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('verify-otp did not set an access token cookie')
  return accessToken
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
})

describe('requireClientAuth', () => {
  it('returns the authenticated client for a valid access token cookie', async () => {
    const accessToken = await verifyAndGetAccessTokenCookie('+33612345601')

    const result = await requireClientAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.client).toEqual({ id: expect.any(String), name: 'Yasmine Kaddour', phone: '+33612345601' })
    }
  })

  it('returns a 401 response when no access token cookie is present', async () => {
    const result = await requireClientAuth(requestWithCookie(''))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response for a malformed access token', async () => {
    const result = await requireClientAuth(requestWithCookie('access_token=not-a-real-jwt'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })
})
