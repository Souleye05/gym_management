import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure } from './server/shared/api-response'

const ACCESS_TOKEN_COOKIE = 'access_token'

const STAFF_PATHS = ['/', '/scan', '/statistiques', '/parametres', '/clients', '/abonnements', '/seances']
const CLIENT_PATHS = ['/accueil']

// Defense-in-depth only, not the primary auth mechanism: every controller behind these paths
// already runs its own full verification (requireStaffAuth/requireClientAuth — JWT decode +
// a fresh database reload of the account). This check is deliberately shallow (cookie presence,
// no JWT decode, no DB call) so it stays cheap on every request; its only job is to guarantee
// a 401 by construction if a future controller under these paths is ever added without wiring
// its own guard, rather than relying on every author remembering to do so.
const PROTECTED_API_PATHS = ['/api/clients', '/api/client/me', '/api/subscriptions', '/api/sessions', '/api/settings']

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // refresh_token is intentionally scoped to Path=/api/auth (see design doc) and is never visible
  // here — an expired access_token with a still-valid refresh_token is allowed through; the client-side
  // guards' /me call will fail, trigger a silent refresh, and only redirect if that also fails.
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value)

  if (!hasSession && matchesPath(pathname, PROTECTED_API_PATHS)) {
    return NextResponse.json(apiFailure('Session expirée.'), { status: 401 })
  }

  if (!hasSession && matchesPath(pathname, STAFF_PATHS)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!hasSession && matchesPath(pathname, CLIENT_PATHS)) {
    return NextResponse.redirect(new URL('/connexion', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/scan/:path*',
    '/statistiques/:path*',
    '/parametres/:path*',
    '/clients/:path*',
    '/abonnements/:path*',
    '/seances/:path*',
    '/accueil/:path*',
    '/api/clients/:path*',
    '/api/client/me/:path*',
    '/api/subscriptions/:path*',
    '/api/sessions/:path*',
    '/api/settings/:path*',
  ],
}
