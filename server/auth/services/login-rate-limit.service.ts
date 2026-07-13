import { err, ok, type Result } from '../../shared/result'
import type { AuthDomainError } from '../domain/errors'
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository'
import type { RateLimitService } from './rate-limit.service'

const MAX_RECENT_FAILURES = 5
const WINDOW_MINUTES = 15

export class LoginRateLimitService implements RateLimitService {
  constructor(private readonly loginAttemptRepository: LoginAttemptRepository) {}

  async assertNotLocked(identifier: string): Promise<Result<void, AuthDomainError>> {
    const failures = await this.loginAttemptRepository.countRecentFailures(identifier, WINDOW_MINUTES)
    if (failures >= MAX_RECENT_FAILURES) {
      return err({ code: 'too-many-attempts', message: 'Trop de tentatives, réessayez plus tard.' })
    }
    return ok(undefined)
  }
}
