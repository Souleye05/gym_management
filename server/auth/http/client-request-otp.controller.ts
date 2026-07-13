import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError, apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import { RequestOtpSchema } from '../dto/client-otp.dto'

export async function clientRequestOtpController(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = RequestOtpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
  }

  const { clientAuthService } = getContainer()
  const result = await clientAuthService.requestOtp(parsed.data)

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  return NextResponse.json(apiSuccess(null, 'Si ce numéro est enregistré, un code a été envoyé.'))
}
