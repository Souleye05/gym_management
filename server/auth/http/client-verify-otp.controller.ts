import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError, apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { extractRequestContext } from '../../shared/extract-request-context'
import { statusForDomainError } from '../../shared/http-status'
import { setAuthCookies } from '../../shared/cookies'
import { getContainer } from '../../shared/container'
import { VerifyOtpSchema } from '../dto/client-otp.dto'

export async function clientVerifyOtpController(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = VerifyOtpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
  }

  const { clientAuthService } = getContainer()
  const result = await clientAuthService.verifyOtp(parsed.data, extractRequestContext(req))

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  const response = NextResponse.json(apiSuccess({ user: result.value.user }, 'Connexion réussie'))
  setAuthCookies(response, result.value.tokens)
  return response
}
