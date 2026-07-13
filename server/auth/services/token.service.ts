import type { Result } from '../../shared/result'
import type { AuthDomainError } from '../domain/errors'
import type { AccessTokenPayload } from '../domain/tokens'

export interface TokenService {
  issueAccessToken(payload: AccessTokenPayload): string
  issueRefreshToken(): string
  verifyAccessToken(token: string): Result<AccessTokenPayload, AuthDomainError>
  hashRefreshToken(token: string): string
}
