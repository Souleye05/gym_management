import { randomBytes, createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { err, ok, type Result } from '../../shared/result'
import type { AuthDomainError } from '../domain/errors'
import type { AccessTokenPayload } from '../domain/tokens'
import type { TokenService } from '../services/token.service'

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const REFRESH_TOKEN_BYTE_LENGTH = 32

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  issueAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS })
  }

  issueRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString('hex')
  }

  verifyAccessToken(token: string): Result<AccessTokenPayload, AuthDomainError> {
    try {
      const decoded = jwt.verify(token, this.secret)
      if (typeof decoded === 'string' || !isAccessTokenPayload(decoded)) {
        return err({ code: 'session-expired', message: 'Session invalide.' })
      }
      return ok({ sub: decoded.sub, kind: decoded.kind, role: decoded.role })
    } catch {
      return err({ code: 'session-expired', message: 'Session expirée.' })
    }
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}

function isAccessTokenPayload(value: object): value is AccessTokenPayload {
  return (
    'sub' in value &&
    typeof value.sub === 'string' &&
    'kind' in value &&
    (value.kind === 'staff' || value.kind === 'client')
  )
}
