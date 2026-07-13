import type { AuthDomainError } from '../auth/domain/errors'

export function statusForDomainError(error: AuthDomainError): number {
  switch (error.code) {
    case 'invalid-credentials':
    case 'unknown-account':
    case 'invalid-otp':
    case 'otp-expired':
    case 'invalid-refresh-token':
    case 'session-expired':
      return 401
    case 'account-inactive':
      return 403
    case 'too-many-attempts':
      return 429
  }
}
