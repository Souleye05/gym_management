import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError, apiSuccess } from '../../shared/api-response'
import { readRefreshTokenCookie, setAuthCookies } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'

const INVALID_REFRESH_TOKEN = { code: 'invalid-refresh-token' as const, message: 'Session expirée.' }

export async function refreshController(req: NextRequest): Promise<NextResponse> {
  const refreshToken = readRefreshTokenCookie(req)
  if (!refreshToken) {
    return NextResponse.json(apiFailureFromDomainError(INVALID_REFRESH_TOKEN), { status: 401 })
  }

  const { refreshTokenLookupService, staffAuthService, clientAuthService } = getContainer()
  const record = await refreshTokenLookupService.findValid(refreshToken)
  if (!record) {
    return NextResponse.json(apiFailureFromDomainError(INVALID_REFRESH_TOKEN), { status: 401 })
  }

  const result = record.staffAccountId
    ? await staffAuthService.refresh(record)
    : await clientAuthService.refresh(record)

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  const response = NextResponse.json(apiSuccess(null, 'Session rafraîchie'))
  setAuthCookies(response, result.value, REFRESH_TOKEN_TTL_SECONDS)
  return response
}
