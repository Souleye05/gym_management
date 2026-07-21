export type MembershipDomainErrorCode =
  | 'client-not-found'
  | 'client-inactive'
  | 'subscription-not-found'
  | 'session-ineligible'

export type MembershipDomainError = {
  code: MembershipDomainErrorCode
  message: string
  /** Only set when code is 'session-ineligible'. */
  reason?: 'none' | 'expired' | 'suspended'
}
