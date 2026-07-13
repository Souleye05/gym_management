import type { RefreshTokenRecord, RefreshTokenRepository } from '../repositories/refresh-token.repository'
import type { TokenService } from './token.service'
import type { RefreshTokenLookupService } from './refresh-token-lookup.service'

export class DefaultRefreshTokenLookupService implements RefreshTokenLookupService {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async findValid(refreshToken: string): Promise<RefreshTokenRecord | null> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken)
    return this.refreshTokenRepository.findValidByHash(tokenHash)
  }
}
