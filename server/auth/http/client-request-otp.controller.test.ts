import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from './client-request-otp.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/auth/client/request-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
})

describe('clientRequestOtpController', () => {
  it('returns a generic success and creates an OTP for a known phone', async () => {
    const res = await clientRequestOtpController(postRequest({ phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)

    const otpCount = await prismaClient.otpCode.count()
    expect(otpCount).toBe(1)
  })

  it('returns the same generic success for an unknown phone, without creating an OTP', async () => {
    const res = await clientRequestOtpController(postRequest({ phone: '+33699999999' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)

    const otpCount = await prismaClient.otpCode.count()
    expect(otpCount).toBe(0)
  })

  it('returns 400 for an invalid phone format', async () => {
    const res = await clientRequestOtpController(postRequest({ phone: 'not-a-phone' }))

    expect(res.status).toBe(400)
  })

  it('returns 429 after too many requests for the same phone within the window', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await clientRequestOtpController(postRequest({ phone: '+33612345601' }))
      expect(res.status).toBe(200)
    }

    const res = await clientRequestOtpController(postRequest({ phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('rate-limits an unknown phone identically to a known one (no enumeration via the rate-limit gate)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await clientRequestOtpController(postRequest({ phone: '+33699999999' }))
      expect(res.status).toBe(200)
    }

    const res = await clientRequestOtpController(postRequest({ phone: '+33699999999' }))

    expect(res.status).toBe(429)
  })
})
