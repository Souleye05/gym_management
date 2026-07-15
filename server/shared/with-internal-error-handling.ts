import { NextResponse } from 'next/server'
import { apiFailure } from './api-response'

/**
 * Wraps a controller body. Any thrown error (deliberately generic Error('internal-error') from a
 * Service's guardAgainstLeakingInternals, or anything unexpected that slipped past it) becomes a
 * uniform 500 response whose body never contains the original error's message — only the literal
 * string "internal-error" crosses into the HTTP response. The real cause is logged server-side.
 */
export async function withInternalErrorHandling(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler()
  } catch (cause) {
    console.error('[Controller] unhandled error', cause)
    return NextResponse.json(apiFailure('internal-error'), { status: 500 })
  }
}
