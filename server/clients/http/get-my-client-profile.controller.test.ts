// server/clients/http/get-my-client-profile.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from '../../auth/http/client-request-otp.controller'
import { clientVerifyOtpController } from '../../auth/http/client-verify-otp.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { cleanClientPortalHistoryTables } from '../../client-portal-history/infrastructure/test-helpers/clean-client-portal-history-tables'
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
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('getMyClientProfileController', () => {
  it('returns 401 when no client session is present', async () => {
    const res = await getMyClientProfileController(new NextRequest('https://example.com/api/client/me/profile'))

    expect(res.status).toBe(401)
  })

  it('returns null/empty history when the session has no linked Client', async () => {
    await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'No Link' } })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345601')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client).toBeNull()
    expect(json.data.subscription).toBeNull()
    expect(json.data.subscriptionHistory).toEqual([])
    expect(json.data.sessionHistory).toEqual([])
  })

  it('returns the linked Client with empty history when it has no subscriptions/sessions', async () => {
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
    expect(json.data.subscription).toBeNull()
    expect(json.data.subscriptionHistory).toEqual([])
    expect(json.data.sessionHistory).toEqual([])
  })

  it('returns the current subscription, full history, and recent sessions for a client with data', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345603', name: 'Has History' } })
    const client = await prismaClient.client.create({
      data: { name: 'Has History', phone: '+33612345603', clientAccountId: account.id },
    })
    await prismaClient.subscription.create({
      data: {
        clientId: client.id,
        planId: 'MONTHLY',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    const current = await prismaClient.subscription.create({
      data: {
        clientId: client.id,
        planId: 'QUARTERLY',
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })
    await prismaClient.session.create({
      data: { type: 'SUBSCRIBER', clientId: client.id, amountPaid: 8, paymentMethod: 'CASH' },
    })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345603')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.subscription.id).toBe(current.id)
    expect(json.data.subscription.planId).toBe('quarterly')
    expect(json.data.subscriptionHistory).toHaveLength(2)
    expect(json.data.sessionHistory).toHaveLength(1)
    expect(json.data.sessionHistory[0].type).toBe('subscriber')
    expect(json.data.sessionHistory[0].paymentMethod).toBe('cash')
  })

  it('caps sessionHistory at 20 even when more sessions exist', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345604', name: 'Frequent Visitor' } })
    const client = await prismaClient.client.create({
      data: { name: 'Frequent Visitor', phone: '+33612345604', clientAccountId: account.id },
    })
    for (let i = 0; i < 25; i++) {
      await prismaClient.session.create({
        data: { type: 'SUBSCRIBER', clientId: client.id, amountPaid: 8, paymentMethod: 'CASH' },
      })
    }
    const cookie = await verifyAndGetAccessTokenCookie('+33612345604')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(json.data.sessionHistory).toHaveLength(20)
  })
})
