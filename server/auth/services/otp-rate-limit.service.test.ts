import { describe, expect, it } from 'vitest'
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository'
import { OtpRateLimitService } from './otp-rate-limit.service'

function fakeLoginAttemptRepository(recentRequests: number): LoginAttemptRepository {
  return {
    record: async () => {},
    countRecentFailures: async () => 0,
    countRecent: async () => recentRequests,
  }
}

describe('OtpRateLimitService', () => {
  it('allows an OTP request when recent requests are below the threshold', async () => {
    const service = new OtpRateLimitService(fakeLoginAttemptRepository(4))

    const result = await service.assertNotLocked('+33612345601')

    expect(result.ok).toBe(true)
  })

  it('locks out when recent requests reach the threshold', async () => {
    const service = new OtpRateLimitService(fakeLoginAttemptRepository(5))

    const result = await service.assertNotLocked('+33612345601')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('too-many-attempts')
    }
  })
})
