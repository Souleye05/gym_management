import { describe, expect, it } from 'vitest'
import { JwtTokenService } from './jwt-token.service'

const service = new JwtTokenService('test-secret')

describe('JwtTokenService', () => {
  it('issues an access token that verifies back to the original payload', () => {
    const token = service.issueAccessToken({ sub: 's1', kind: 'staff', role: 'ADMIN' })

    const result = service.verifyAccessToken(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ sub: 's1', kind: 'staff', role: 'ADMIN' })
    }
  })

  it('issues a client access token without a role', () => {
    const token = service.issueAccessToken({ sub: 'c1', kind: 'client' })

    const result = service.verifyAccessToken(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.role).toBeUndefined()
    }
  })

  it('rejects a token signed with a different secret', () => {
    const otherService = new JwtTokenService('other-secret')
    const token = otherService.issueAccessToken({ sub: 's1', kind: 'staff', role: 'ADMIN' })

    const result = service.verifyAccessToken(token)

    expect(result.ok).toBe(false)
  })

  it('rejects a malformed token', () => {
    const result = service.verifyAccessToken('not-a-jwt')

    expect(result.ok).toBe(false)
  })

  it('issues refresh tokens that are long, opaque, and unique', () => {
    const first = service.issueRefreshToken()
    const second = service.issueRefreshToken()

    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(64)
    expect(/^[0-9a-f]+$/.test(first)).toBe(true)
  })

  it('hashes a refresh token deterministically', () => {
    const token = service.issueRefreshToken()

    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token))
    expect(service.hashRefreshToken(token)).not.toBe(token)
  })

  it('produces different hashes for different tokens', () => {
    const a = service.issueRefreshToken()
    const b = service.issueRefreshToken()

    expect(service.hashRefreshToken(a)).not.toBe(service.hashRefreshToken(b))
  })
})
