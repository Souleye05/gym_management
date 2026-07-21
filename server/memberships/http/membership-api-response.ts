import type { MembershipDomainError } from '../domain/errors'
import { apiFailure, type ApiFailure } from '../../shared/api-response'

export function apiFailureFromMembershipDomainError(error: MembershipDomainError): ApiFailure {
  return apiFailure(error.message, error.reason ? [{ field: 'reason', message: error.reason }] : null)
}

export function statusForMembershipDomainError(error: MembershipDomainError): number {
  switch (error.code) {
    case 'client-not-found':
    case 'client-inactive':
    case 'subscription-not-found':
      return 404
    case 'session-ineligible':
      return 422
  }
}
