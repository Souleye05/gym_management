import type { Result } from '../../shared/result'
import type { RequestContext } from '../../shared/request-context'
import type { StaffLoginDto } from '../dto/staff-login.dto'
import type { AuthDomainError } from '../domain/errors'
import type { StaffUser } from '../domain/entities'
import type { AuthTokens } from '../domain/tokens'

export interface StaffAuthService {
  login(input: StaffLoginDto, context: RequestContext): Promise<Result<{ user: StaffUser; tokens: AuthTokens }, AuthDomainError>>
  logout(refreshToken: string): Promise<void>
  getMe(accessToken: string): Promise<Result<StaffUser, AuthDomainError>>
  refresh(refreshToken: string): Promise<Result<AuthTokens, AuthDomainError>>
}
