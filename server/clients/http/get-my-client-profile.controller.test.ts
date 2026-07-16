import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from '../../auth/http/client-request-otp.controller'
import { clientVerifyOtpController } from '../../auth/http/client-verify-otp.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { getMyClientProfileController } from './get-my-client-profile.controller'

const SIMULATED_OTP_CODE = '123456'

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
  return `access_token=${accessToken}`
}

function profileRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/client/me/profile', { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('getMyClientProfileController', () => {
  it('returns 401 when no client session is present', async () => {
    const res = await getMyClientProfileController(new NextRequest('https://example.com/api/client/me/profile'))

    expect(res.status).toBe(401)
  })

  it('returns { client: null } when the session has no linked Client', async () => {
    await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'No Link' } })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345601')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client).toBeNull()
  })

  it('returns the linked Client when the session has one', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345602', name: 'Has Link' } })
    await prismaClient.client.create({
      data: { name: 'Has Link', phone: '+33612345602', clientAccountId: account.id },
    })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345602')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Has Link')
    expect(json.data.client.cardNumber).toMatch(/^CARD-\d{5,}$/)
  })
})
