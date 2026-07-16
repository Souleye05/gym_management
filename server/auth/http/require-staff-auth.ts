import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError } from '../../shared/api-response'
import { readAccessTokenCookie } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import type { Role } from '../domain/enums'

export type AuthenticatedStaff = { id: string; email: string; name: string; role: Role }

export type RequireStaffAuthResult =
  | { ok: true; staff: AuthenticatedStaff }
  | { ok: false; response: NextResponse }

export async function requireStaffAuth(req: NextRequest): Promise<RequireStaffAuthResult> {
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError({ code: 'session-expired', message: 'Session expirée.' }), {
        status: 401,
      }),
    }
  }

  const { staffAuthService } = getContainer()
  const result = await staffAuthService.getMe(accessToken)

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) }),
    }
  }

  return { ok: true, staff: result.value }
}
