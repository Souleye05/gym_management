import type { ClientDomainError } from '../clients/domain/errors'
import { apiFailure, type ApiFailure } from './api-response'

export function apiFailureFromClientDomainError(error: ClientDomainError): ApiFailure {
  if (error.field) {
    return apiFailure(error.message, [{ field: error.field, message: error.message }])
  }
  return apiFailure(error.message)
}

export function statusForClientDomainError(error: ClientDomainError): number {
  switch (error.code) {
    case 'not-found':
      return 404
    case 'phone-already-used':
      return 409
    case 'validation-error':
      return 400
  }
}
