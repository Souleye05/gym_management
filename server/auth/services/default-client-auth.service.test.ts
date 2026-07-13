import { describe, expect, it } from 'vitest'
import { ok, err } from '../../shared/result'
import type { ClientAccountRecord, ClientAccountRepository } from '../repositories/client-account.repository'
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'
import type { OtpRecord, OtpRepository } from '../repositories/otp.repository'
import type { LoginLogRepository, RecordLoginLogInput } from '../repositories/login-log.repository'
import type { OtpService } from './otp.service'
import type { TokenService } from './token.service'
import { DefaultClientAuthService } from './default-client-auth.service'

const ACCOUNT: ClientAccountRecord = { id: 'c1', phone: '+33612345601', name: 'Yasmine Kaddour', isActive: true }

const VALID_OTP: OtpRecord = {
  id: 'otp1',
  clientAccountId: 'c1',
  codeHash: 'hash-of-123456',
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
  attempts: 0,
}

function fakeClientAccountRepository(account: ClientAccountRecord | null = ACCOUNT): ClientAccountRepository {
  return {
    findByPhone: async (phone) => (account && account.phone === phone ? account : null),
    findById: async (id) => (account && account.id === id ? account : null),
  }
}

function fakeRefreshTokenRepository(existing: RefreshTokenRecord | null = null) {
  const created: CreateRefreshTokenInput[] = []
  const revoked: string[] = []
  const repository: RefreshTokenRepository = {
    create: async (input) => {
      created.push(input)
    },
    findValidByHash: async () => existing,
    revoke: async (tokenHash) => {
      revoked.push(tokenHash)
    },
  }
  return { repository, created, revoked }
}

function fakeOtpRepository(otp: OtpRecord | null = VALID_OTP, consumeSucceeds = true) {
  const created: unknown[] = []
  const incrementedAttempts: string[] = []
  const consumed: string[] = []
  const repository: OtpRepository = {
    create: async (input) => {
      created.push(input)
    },
    findLatestValid: async () => otp,
    incrementAttempts: async (id) => {
      incrementedAttempts.push(id)
    },
    consume: async (id) => {
      consumed.push(id)
      return consumeSucceeds
    },
  }
  return { repository, created, incrementedAttempts, consumed }
}

function fakeLoginLogRepository() {
  const records: RecordLoginLogInput[] = []
  const repository: LoginLogRepository = {
    record: async (input) => {
      records.push(input)
    },
  }
  return { repository, records }
}

function fakeOtpService(codeIsValid: boolean): OtpService {
  return {
    generate: () => ({ code: '123456', hash: 'hash-of-123456' }),
    verify: () => codeIsValid,
  }
}

function fakeTokenService(): TokenService {
  return {
    issueAccessToken: (payload) => `access-${payload.sub}`,
    issueRefreshToken: () => 'refresh-raw-token',
    verifyAccessToken: (token) => {
      if (token === 'access-c1') return ok({ sub: 'c1', kind: 'client' })
      if (token === 'access-staff-token') return ok({ sub: 's1', kind: 'staff', role: 'ADMIN' })
      return err({ code: 'session-expired', message: 'Session expirée.' })
    },
    hashRefreshToken: (token) => `hashed-${token}`,
  }
}

describe('DefaultClientAuthService.requestOtp', () => {
  it('creates an OTP for a known, active account', async () => {
    const otp = fakeOtpRepository(null)
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.requestOtp({ phone: '+33612345601' })

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(1)
  })

  it('succeeds generically for an unknown phone, without creating an OTP (anti-enumeration)', async () => {
    const otp = fakeOtpRepository(null)
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(null),
      fakeRefreshTokenRepository().repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.requestOtp({ phone: '+33600000000' })

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(0)
  })

  it('succeeds generically for an inactive account, without creating an OTP', async () => {
    const inactive: ClientAccountRecord = { ...ACCOUNT, isActive: false }
    const otp = fakeOtpRepository(null)
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(inactive),
      fakeRefreshTokenRepository().repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.requestOtp({ phone: '+33612345601' })

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(0)
  })
})

describe('DefaultClientAuthService.verifyOtp', () => {
  it('succeeds with a valid code and issues tokens', async () => {
    const otp = fakeOtpRepository()
    const refreshTokens = fakeRefreshTokenRepository()
    const loginLogs = fakeLoginLogRepository()
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      refreshTokens.repository,
      otp.repository,
      loginLogs.repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.user).toEqual({ id: 'c1', name: 'Yasmine Kaddour', phone: '+33612345601' })
    }
    expect(otp.consumed).toEqual(['otp1'])
    expect(refreshTokens.created).toHaveLength(1)
    const expectedExpiry = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    expect(refreshTokens.created[0].expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
    expect(loginLogs.records[0].succeeded).toBe(true)
  })

  it('rejects an unknown phone', async () => {
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(null),
      fakeRefreshTokenRepository().repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33600000000', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unknown-account')
  })

  it('rejects when no valid OTP exists (expired or never requested)', async () => {
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeOtpRepository(null).repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('otp-expired')
  })

  it('rejects and increments attempts on a wrong code', async () => {
    const otp = fakeOtpRepository()
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(false),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33612345601', code: '000000' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
    expect(otp.incrementedAttempts).toEqual(['otp1'])
    expect(otp.consumed).toHaveLength(0)
  })

  it('rejects the loser of a concurrent consume race, without issuing tokens', async () => {
    const otp = fakeOtpRepository(VALID_OTP, false)
    const refreshTokens = fakeRefreshTokenRepository()
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      refreshTokens.repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
    expect(refreshTokens.created).toHaveLength(0)
  })

  it('rejects once the OTP has reached the max attempts, without checking the code', async () => {
    const maxedOut: OtpRecord = { ...VALID_OTP, attempts: 5 }
    const otp = fakeOtpRepository(maxedOut)
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      otp.repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-many-attempts')
    expect(otp.consumed).toHaveLength(0)
  })
})

describe('DefaultClientAuthService.getMe', () => {
  it('returns the user for a valid client access token', async () => {
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.getMe('access-c1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.phone).toBe('+33612345601')
  })

  it('rejects a staff access token used against the client service', async () => {
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.getMe('access-staff-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('session-expired')
  })
})

describe('DefaultClientAuthService.refresh', () => {
  it('rotates the refresh token on success', async () => {
    const validStored: RefreshTokenRecord = {
      id: 'rt1',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: null,
      clientAccountId: 'c1',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const refreshTokens = fakeRefreshTokenRepository(validStored)
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      refreshTokens.repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.refresh('refresh-raw-token')

    expect(result.ok).toBe(true)
    expect(refreshTokens.revoked).toContain('hashed-refresh-raw-token')
    expect(refreshTokens.created).toHaveLength(1)
    const expectedExpiry = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    expect(refreshTokens.created[0].expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
  })

  it('does not revoke the old token if issuing the new one fails', async () => {
    const validStored: RefreshTokenRecord = {
      id: 'rt1',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: null,
      clientAccountId: 'c1',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const revoked: string[] = []
    const failingRefreshTokens: RefreshTokenRepository = {
      create: async () => {
        throw new Error('transient database error')
      },
      findValidByHash: async () => validStored,
      revoke: async (tokenHash) => {
        revoked.push(tokenHash)
      },
    }
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      failingRefreshTokens,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    await expect(service.refresh('refresh-raw-token')).rejects.toThrow('transient database error')
    expect(revoked).toHaveLength(0)
  })

  it('rejects an unknown or expired refresh token', async () => {
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository(null).repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.refresh('unknown-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-refresh-token')
  })

  it('rejects a refresh token owned by a staff account, not a client', async () => {
    const staffOwned: RefreshTokenRecord = {
      id: 'rt2',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: 's1',
      clientAccountId: null,
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      fakeRefreshTokenRepository(staffOwned).repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.refresh('refresh-raw-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-refresh-token')
  })

  it('rejects when the account is inactive', async () => {
    const validStored: RefreshTokenRecord = {
      id: 'rt1',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: null,
      clientAccountId: 'c1',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const inactive: ClientAccountRecord = { ...ACCOUNT, isActive: false }
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(inactive),
      fakeRefreshTokenRepository(validStored).repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    const result = await service.refresh('refresh-raw-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('account-inactive')
  })
})

describe('DefaultClientAuthService.logout', () => {
  it('revokes the refresh token', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const service = new DefaultClientAuthService(
      fakeClientAccountRepository(),
      refreshTokens.repository,
      fakeOtpRepository().repository,
      fakeLoginLogRepository().repository,
      fakeOtpService(true),
      fakeTokenService(),
    )

    await service.logout('refresh-raw-token')

    expect(refreshTokens.revoked).toEqual(['hashed-refresh-raw-token'])
  })
})
