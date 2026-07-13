import type { NextRequest, NextResponse } from 'next/server'
import type { AuthTokens } from '../auth/domain/tokens'

const ACCESS_TOKEN_COOKIE = 'access_token'
const REFRESH_TOKEN_COOKIE = 'refresh_token'

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function isSecure(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function setAuthCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  })
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  })
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', { path: '/', maxAge: 0 })
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', { path: '/api/auth', maxAge: 0 })
}

export function readAccessTokenCookie(request: NextRequest): string | null {
  return request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export function readRefreshTokenCookie(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
