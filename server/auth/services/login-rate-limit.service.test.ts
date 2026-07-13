import { describe, expect, it } from 'vitest'
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository'
import { LoginRateLimitService } from './login-rate-limit.service'

function fakeLoginAttemptRepository(recentFailures: number): LoginAttemptRepository {
  return {
    record: async () => {},
    countRecentFailures: async () => recentFailures,
  }
}

describe('LoginRateLimitService', () => {
  it('allows login when failures are below the threshold', async () => {
    const service = new LoginRateLimitService(fakeLoginAttemptRepository(4))

    const result = await service.assertNotLocked('admin@atlas.fit')

    expect(result.ok).toBe(true)
  })

  it('locks out when failures reach the threshold', async () => {
    const service = new LoginRateLimitService(fakeLoginAttemptRepository(5))

    const result = await service.assertNotLocked('admin@atlas.fit')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('too-many-attempts')
    }
  })
})
