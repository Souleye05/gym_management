import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError, apiSuccess } from '../../shared/api-response'
import { readRefreshTokenCookie, setAuthCookies } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'

export async function refreshController(req: NextRequest): Promise<NextResponse> {
  const refreshToken = readRefreshTokenCookie(req)
  if (!refreshToken) {
    return NextResponse.json(apiFailureFromDomainError({ code: 'invalid-refresh-token', message: 'Session expirée.' }), {
      status: 401,
    })
  }

  const { staffAuthService, clientAuthService } = getContainer()

  const staffResult = await staffAuthService.refresh(refreshToken)
  const result = staffResult.ok || staffResult.error.code !== 'invalid-refresh-token'
    ? staffResult
    : await clientAuthService.refresh(refreshToken)

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  const response = NextResponse.json(apiSuccess(null, 'Session rafraîchie'))
  setAuthCookies(response, result.value, REFRESH_TOKEN_TTL_SECONDS)
  return response
}
