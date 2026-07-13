import type { Result } from '../../shared/result'
import type { AuthDomainError } from '../domain/errors'

export interface RateLimitService {
  assertNotLocked(identifier: string): Promise<Result<void, AuthDomainError>>
}
