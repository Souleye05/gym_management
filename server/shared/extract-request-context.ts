import type { NextRequest } from 'next/server'
import type { RequestContext } from './request-context'

/**
 * `x-vercel-forwarded-for` is set by Vercel's edge network itself and cannot be spoofed by the
 * client (Vercel strips/overwrites any client-sent value) — trust it first when present. Plain
 * `x-forwarded-for`/`x-real-ip` are client-controllable unless a trusted reverse proxy in front
 * of this app is configured to strip/overwrite them; they're kept only as a local-dev fallback
 * (no such platform header exists there). Audit fields only — never used for auth decisions.
 */
export function extractRequestContext(request: NextRequest): RequestContext {
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for')
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress =
    vercelForwardedFor?.split(',')[0]?.trim() ||
    forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  const userAgent = request.headers.get('user-agent') ?? undefined

  return { ipAddress, userAgent }
}
