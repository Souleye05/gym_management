import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'
import { clearAuthCookies, readAccessTokenCookie, readRefreshTokenCookie, setAuthCookies } from './cookies'

const TOKENS = { accessToken: 'access-abc', refreshToken: 'refresh-xyz' }
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

describe('cookies', () => {
  it('sets both auth cookies as HttpOnly with the expected paths', () => {
    const response = NextResponse.json({ ok: true })

    setAuthCookies(response, TOKENS, REFRESH_TOKEN_TTL_SECONDS)

    const access = response.cookies.get('access_token')
    const refresh = response.cookies.get('refresh_token')
    expect(access?.value).toBe('access-abc')
    expect(access?.path).toBe('/')
    expect(refresh?.value).toBe('refresh-xyz')
    expect(refresh?.path).toBe('/api/auth')
    expect(refresh?.maxAge).toBe(REFRESH_TOKEN_TTL_SECONDS)

    const setCookieHeader = response.headers.get('set-cookie') ?? ''
    expect(setCookieHeader.toLowerCase()).toContain('httponly')
  })

  it('uses a different refresh token TTL when given one (e.g. for client sessions)', () => {
    const response = NextResponse.json({ ok: true })
    const clientTtlSeconds = 24 * 60 * 60

    setAuthCookies(response, TOKENS, clientTtlSeconds)

    expect(response.cookies.get('refresh_token')?.maxAge).toBe(clientTtlSeconds)
  })

  it('clears both auth cookies', () => {
    const response = NextResponse.json({ ok: true })
    setAuthCookies(response, TOKENS, REFRESH_TOKEN_TTL_SECONDS)

    clearAuthCookies(response)

    expect(response.cookies.get('access_token')?.value).toBe('')
    expect(response.cookies.get('refresh_token')?.value).toBe('')
  })

  it('reads the access token from a request', () => {
    const request = new NextRequest('https://example.com/api/auth/staff/me', {
      headers: { cookie: 'access_token=abc123' },
    })

    expect(readAccessTokenCookie(request)).toBe('abc123')
  })

  it('returns null when the access token cookie is absent', () => {
    const request = new NextRequest('https://example.com/api/auth/staff/me')

    expect(readAccessTokenCookie(request)).toBeNull()
  })

  it('reads the refresh token from a request', () => {
    const request = new NextRequest('https://example.com/api/auth/refresh', {
      headers: { cookie: 'refresh_token=xyz789' },
    })

    expect(readRefreshTokenCookie(request)).toBe('xyz789')
  })
})
