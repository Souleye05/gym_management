export type AuthDomainErrorCode =
  | 'invalid-credentials'
  | 'unknown-account'
  | 'invalid-otp'
  | 'otp-expired'
  | 'too-many-attempts'
  | 'account-inactive'
  | 'invalid-refresh-token'
  | 'session-expired'

export type AuthDomainError = {
  code: AuthDomainErrorCode
  message: string
  field?: string
}
