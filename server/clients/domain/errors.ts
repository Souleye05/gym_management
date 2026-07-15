export type ClientDomainErrorCode = 'not-found' | 'validation-error' | 'phone-already-used'

export type ClientDomainError = {
  code: ClientDomainErrorCode
  message: string
  field?: string
}
