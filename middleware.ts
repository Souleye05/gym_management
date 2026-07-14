import { NextResponse, type NextRequest } from 'next/server'

const ACCESS_TOKEN_COOKIE = 'access_token'

const STAFF_PATHS = ['/', '/scan', '/statistiques', '/parametres', '/clients', '/abonnements', '/seances']
const CLIENT_PATHS = ['/accueil']

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // refresh_token is intentionally scoped to Path=/api/auth (see design doc) and is never visible
  // here — an expired access_token with a still-valid refresh_token is allowed through; the client-side
  // guards' /me call will fail, trigger a silent refresh, and only redirect if that also fails.
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value)

  if (!hasSession && matchesPath(pathname, STAFF_PATHS)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!hasSession && matchesPath(pathname, CLIENT_PATHS)) {
    return NextResponse.redirect(new URL('/connexion', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/scan/:path*', '/statistiques/:path*', '/parametres/:path*', '/clients/:path*', '/abonnements/:path*', '/seances/:path*', '/accueil/:path*'],
}
