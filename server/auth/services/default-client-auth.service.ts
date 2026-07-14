import { err, ok, type Result } from '../../shared/result'
import type { RequestContext } from '../../shared/request-context'
import type { RequestOtpDto, VerifyOtpDto } from '../dto/client-otp.dto'
import type { AuthDomainError } from '../domain/errors'
import type { ClientUser } from '../domain/entities'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'
import type { AuthTokens } from '../domain/tokens'
import type { ClientAccountRepository } from '../repositories/client-account.repository'
import type { RefreshTokenRecord, RefreshTokenRepository } from '../repositories/refresh-token.repository'
import type { OtpRepository } from '../repositories/otp.repository'
import type { LoginLogRepository } from '../repositories/login-log.repository'
import type { OtpService } from './otp.service'
import type { TokenService } from './token.service'
import type { ClientAuthService } from './client-auth.service'

const REFRESH_TOKEN_DURATION_MS = REFRESH_TOKEN_TTL_SECONDS * 1000
const OTP_DURATION_MS = 10 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

// Deliberately identical for unknown account, expired/missing OTP, and wrong code: verifyOtp
// must never let a caller distinguish "this phone isn't registered" from "wrong/expired code"
// (see requestOtp's own anti-enumeration comment) — otherwise verify-otp becomes an oracle for
// enumerating registered phone numbers without ever calling request-otp.
const INVALID_OTP: AuthDomainError = { code: 'invalid-otp', message: 'Code incorrect.' }
const TOO_MANY_ATTEMPTS: AuthDomainError = { code: 'too-many-attempts', message: 'Trop de tentatives, veuillez redemander un code.' }

export class DefaultClientAuthService implements ClientAuthService {
  constructor(
    private readonly clientAccountRepository: ClientAccountRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly otpRepository: OtpRepository,
    private readonly loginLogRepository: LoginLogRepository,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  async requestOtp(input: RequestOtpDto): Promise<Result<void, AuthDomainError>> {
    const account = await this.clientAccountRepository.findByPhone(input.phone)
    if (account && account.isActive) {
      const { hash } = this.otpService.generate()
      await this.otpRepository.create({
        clientAccountId: account.id,
        codeHash: hash,
        expiresAt: new Date(Date.now() + OTP_DURATION_MS),
      })
    }
    // Always succeeds, whether or not the phone is a known account, to avoid account enumeration.
    return ok(undefined)
  }

  async verifyOtp(
    input: VerifyOtpDto,
    context: RequestContext,
  ): Promise<Result<{ user: ClientUser; tokens: AuthTokens }, AuthDomainError>> {
    const account = await this.clientAccountRepository.findByPhone(input.phone)
    if (!account || !account.isActive) {
      return err(INVALID_OTP)
    }

    const otp = await this.otpRepository.findLatestValid(account.id)
    if (!otp) {
      return err(INVALID_OTP)
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      return err(TOO_MANY_ATTEMPTS)
    }

    const codeValid = this.otpService.verify(input.code, otp.codeHash)
    if (!codeValid) {
      await this.otpRepository.incrementAttempts(otp.id)
      return err(INVALID_OTP)
    }

    const consumed = await this.otpRepository.consume(otp.id)
    if (!consumed) {
      return err(INVALID_OTP)
    }

    await this.loginLogRepository.record({
      kind: 'client',
      succeeded: true,
      clientAccountId: account.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const user: ClientUser = { id: account.id, name: account.name, phone: account.phone }
    const tokens = await this.issueTokens(account.id, context)

    return ok({ user, tokens })
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken)
    await this.refreshTokenRepository.revoke(tokenHash)
  }

  async getMe(accessToken: string): Promise<Result<ClientUser, AuthDomainError>> {
    const payload = this.tokenService.verifyAccessToken(accessToken)
    if (!payload.ok) return err(payload.error)
    if (payload.value.kind !== 'client') {
      return err({ code: 'session-expired', message: 'Session expirée.' })
    }

    const account = await this.clientAccountRepository.findById(payload.value.sub)
    if (!account || !account.isActive) {
      return err({ code: 'account-inactive', message: 'Compte désactivé.' })
    }

    return ok({ id: account.id, name: account.name, phone: account.phone })
  }

  async refresh(record: RefreshTokenRecord): Promise<Result<AuthTokens, AuthDomainError>> {
    if (!record.clientAccountId) {
      return err({ code: 'invalid-refresh-token', message: 'Session expirée.' })
    }

    const account = await this.clientAccountRepository.findById(record.clientAccountId)
    if (!account || !account.isActive) {
      return err({ code: 'account-inactive', message: 'Compte désactivé.' })
    }

    // Revoke first: it's the atomic claim that prevents two concurrent refresh calls for the
    // same token from both succeeding. Only the caller that actually revokes issues a new token.
    const claimed = await this.refreshTokenRepository.revoke(record.tokenHash)
    if (!claimed) {
      return err({ code: 'invalid-refresh-token', message: 'Session expirée.' })
    }

    const tokens = await this.issueTokens(account.id, {})

    return ok(tokens)
  }

  private async issueTokens(clientAccountId: string, context: RequestContext): Promise<AuthTokens> {
    const accessToken = this.tokenService.issueAccessToken({ sub: clientAccountId, kind: 'client' })
    const refreshToken = this.tokenService.issueRefreshToken()

    await this.refreshTokenRepository.create({
      tokenHash: this.tokenService.hashRefreshToken(refreshToken),
      ownerId: clientAccountId,
      ownerKind: 'client',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DURATION_MS),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    })

    return { accessToken, refreshToken }
  }
}
