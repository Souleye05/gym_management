import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLoginController } from './staff-login.controller'

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.create({
    data: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
})

describe('staffLoginController', () => {
  it('returns the user and sets auth cookies on success', async () => {
    const req = postRequest('https://example.com/api/auth/staff/login', {
      email: 'admin@atlas.fit',
      password: 'admin123',
    })

    const res = await staffLoginController(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      success: true,
      data: { user: { id: expect.any(String), name: 'Admin Studio', email: 'admin@atlas.fit', role: 'ADMIN' } },
      message: 'Connexion réussie',
      errors: null,
    })
    expect(res.cookies.get('access_token')?.value).toBeTruthy()
    expect(res.cookies.get('refresh_token')?.value).toBeTruthy()
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const req = postRequest('https://example.com/api/auth/staff/login', { email: 'not-an-email', password: '' })

    const res = await staffLoginController(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'password' }),
      ]),
    )
  })

  it('returns 401 for wrong credentials without setting cookies', async () => {
    const req = postRequest('https://example.com/api/auth/staff/login', {
      email: 'admin@atlas.fit',
      password: 'wrong-password',
    })

    const res = await staffLoginController(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json).toEqual({ success: false, data: null, message: 'Identifiants invalides.', errors: null })
    expect(res.cookies.get('access_token')).toBeUndefined()
  })

  it('returns 400 when the request body is not valid JSON', async () => {
    const req = new NextRequest('https://example.com/api/auth/staff/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    const res = await staffLoginController(req)

    expect(res.status).toBe(400)
  })
})
