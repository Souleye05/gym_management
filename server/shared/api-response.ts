import type { ZodError } from 'zod'
import type { AuthDomainError } from '../auth/domain/errors'

export type ApiSuccess<T> = { success: true; data: T; message: string; errors: null }
export type ApiFailure = { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function apiSuccess<T>(data: T, message = ''): ApiSuccess<T> {
  return { success: true, data, message, errors: null }
}

export function apiFailure(message: string, errors: { field: string; message: string }[] | null = null): ApiFailure {
  return { success: false, data: null, message, errors }
}

export function apiFailureFromZod(error: ZodError, message = 'Requête invalide'): ApiFailure {
  const errors = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
  return apiFailure(message, errors)
}

export function apiFailureFromDomainError(error: AuthDomainError): ApiFailure {
  return apiFailure(error.message)
}
