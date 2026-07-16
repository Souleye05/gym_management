import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError } from '../../shared/api-response'
import { readAccessTokenCookie } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import type { ClientUser } from '../domain/entities'

export type RequireClientAuthResult =
  | { ok: true; client: ClientUser }
  | { ok: false; response: NextResponse }

export async function requireClientAuth(req: NextRequest): Promise<RequireClientAuthResult> {
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError({ code: 'session-expired', message: 'Session expirée.' }), {
        status: 401,
      }),
    }
  }

  const { clientAuthService } = getContainer()
  const result = await clientAuthService.getMe(accessToken)

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) }),
    }
  }

  return { ok: true, client: result.value }
}
