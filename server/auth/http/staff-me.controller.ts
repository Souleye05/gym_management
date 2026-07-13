import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError, apiSuccess } from '../../shared/api-response'
import { readAccessTokenCookie } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'

export async function staffMeController(req: NextRequest): Promise<NextResponse> {
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    return NextResponse.json(apiFailureFromDomainError({ code: 'session-expired', message: 'Session expirée.' }), {
      status: 401,
    })
  }

  const { staffAuthService } = getContainer()
  const result = await staffAuthService.getMe(accessToken)

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  return NextResponse.json(apiSuccess({ user: result.value }))
}
