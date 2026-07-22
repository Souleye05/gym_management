import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware } from './middleware'

function requestTo(pathname: string, cookie = ''): NextRequest {
  return new NextRequest(`https://example.com${pathname}`, { headers: cookie ? { cookie } : {} })
}

describe('middleware — protected API routes (defense-in-depth, cookie presence only)', () => {
  it('returns 401 for /api/clients with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/clients'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/clients/:id with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/clients/abc123'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/client/me/profile with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/client/me/profile'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/subscriptions with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/subscriptions'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/subscriptions/:id with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/subscriptions/abc123'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/sessions with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/sessions'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/sessions/:id with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/sessions/abc123'))

    expect(res.status).toBe(401)
  })

  it('returns 401 for /api/settings with no access_token cookie', async () => {
    const res = middleware(requestTo('/api/settings'))

    expect(res.status).toBe(401)
  })

  it('lets the request through to the route handler when an access_token cookie is present', async () => {
    const res = middleware(requestTo('/api/clients', 'access_token=some-token'))

    expect(res.status).not.toBe(401)
  })

  it('lets /api/subscriptions through to the route handler when an access_token cookie is present', async () => {
    const res = middleware(requestTo('/api/subscriptions', 'access_token=some-token'))

    expect(res.status).not.toBe(401)
  })

  it('lets /api/sessions through to the route handler when an access_token cookie is present', async () => {
    const res = middleware(requestTo('/api/sessions', 'access_token=some-token'))

    expect(res.status).not.toBe(401)
  })

  it('lets /api/settings through to the route handler when an access_token cookie is present', async () => {
    const res = middleware(requestTo('/api/settings', 'access_token=some-token'))

    expect(res.status).not.toBe(401)
  })
})

describe('middleware — public API routes remain accessible with no cookie', () => {
  const PUBLIC_API_ROUTES = [
    '/api/auth/staff/login',
    '/api/auth/staff/logout',
    '/api/auth/client/request-otp',
    '/api/auth/client/verify-otp',
    '/api/auth/client/logout',
    '/api/auth/refresh',
  ]

  for (const route of PUBLIC_API_ROUTES) {
    it(`does not block ${route} with no cookie`, async () => {
      const res = middleware(requestTo(route))

      expect(res.status).not.toBe(401)
    })
  }
})

describe('middleware — /me endpoints (already self-authenticating, not additionally gated)', () => {
  it('does not block /api/auth/staff/me with no cookie (controller returns its own 401)', async () => {
    const res = middleware(requestTo('/api/auth/staff/me'))

    expect(res.status).not.toBe(401)
  })

  it('does not block /api/auth/client/me with no cookie (controller returns its own 401)', async () => {
    const res = middleware(requestTo('/api/auth/client/me'))

    expect(res.status).not.toBe(401)
  })
})

describe('middleware — existing page-route protection is unchanged', () => {
  it('redirects unauthenticated staff page requests to /login', async () => {
    const res = middleware(requestTo('/clients'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/login')
  })

  it('redirects unauthenticated client page requests to /connexion', async () => {
    const res = middleware(requestTo('/accueil'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/connexion')
  })

  it('allows a page request through when a session cookie is present', async () => {
    const res = middleware(requestTo('/clients', 'access_token=some-token'))

    expect(res.status).not.toBe(307)
  })
})
