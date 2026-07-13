import type { Result } from '../../shared/result'
import type { RequestContext } from '../../shared/request-context'
import type { RequestOtpDto, VerifyOtpDto } from '../dto/client-otp.dto'
import type { AuthDomainError } from '../domain/errors'
import type { ClientUser } from '../domain/entities'
import type { AuthTokens } from '../domain/tokens'

export interface ClientAuthService {
  requestOtp(input: RequestOtpDto): Promise<Result<void, AuthDomainError>>
  verifyOtp(input: VerifyOtpDto, context: RequestContext): Promise<Result<{ user: ClientUser; tokens: AuthTokens }, AuthDomainError>>
  logout(refreshToken: string): Promise<void>
  getMe(accessToken: string): Promise<Result<ClientUser, AuthDomainError>>
}
