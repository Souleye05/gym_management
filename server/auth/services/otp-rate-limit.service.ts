import { err, ok, type Result } from '../../shared/result'
import type { AuthDomainError } from '../domain/errors'
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository'
import type { RateLimitService } from './rate-limit.service'

const MAX_RECENT_REQUESTS = 5
const WINDOW_MINUTES = 15

export class OtpRateLimitService implements RateLimitService {
  constructor(private readonly loginAttemptRepository: LoginAttemptRepository) {}

  async assertNotLocked(identifier: string): Promise<Result<void, AuthDomainError>> {
    const recentRequests = await this.loginAttemptRepository.countRecent('OTP_REQUEST', identifier, WINDOW_MINUTES)
    if (recentRequests >= MAX_RECENT_REQUESTS) {
      return err({ code: 'too-many-attempts', message: 'Trop de tentatives, réessayez plus tard.' })
    }
    return ok(undefined)
  }
}
