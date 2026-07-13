import type { NextRequest } from 'next/server'
import type { RequestContext } from './request-context'

export function extractRequestContext(request: NextRequest): RequestContext {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined
  const userAgent = request.headers.get('user-agent') ?? undefined

  return { ipAddress, userAgent }
}
