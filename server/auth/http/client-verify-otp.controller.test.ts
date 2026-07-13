import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from './client-request-otp.controller'
import { clientVerifyOtpController } from './client-verify-otp.controller'

const SIMULATED_OTP_CODE = '123456'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/auth/client/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function requestOtpFor(phone: string): Promise<void> {
  const req = new NextRequest('https://example.com/api/auth/client/request-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  await clientRequestOtpController(req)
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
})

describe('clientVerifyOtpController', () => {
  it('returns the user and sets auth cookies for a correct code', async () => {
    await requestOtpFor('+33612345601')

    const res = await clientVerifyOtpController(
      postRequest({ phone: '+33612345601', code: SIMULATED_OTP_CODE }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.user).toEqual({ id: expect.any(String), name: 'Yasmine Kaddour', phone: '+33612345601' })
    expect(res.cookies.get('access_token')?.value).toBeTruthy()
    expect(res.cookies.get('refresh_token')?.value).toBeTruthy()
  })

  it('returns 401 for a wrong code', async () => {
    await requestOtpFor('+33612345601')

    const res = await clientVerifyOtpController(postRequest({ phone: '+33612345601', code: '000000' }))

    expect(res.status).toBe(401)
  })

  it('returns 401 when no OTP was ever requested', async () => {
    const res = await clientVerifyOtpController(
      postRequest({ phone: '+33612345601', code: SIMULATED_OTP_CODE }),
    )

    expect(res.status).toBe(401)
  })

  it('returns 400 for a malformed code', async () => {
    const res = await clientVerifyOtpController(postRequest({ phone: '+33612345601', code: '12' }))

    expect(res.status).toBe(400)
  })
})
