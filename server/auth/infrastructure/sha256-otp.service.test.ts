import { describe, expect, it } from 'vitest'
import { Sha256OtpService } from './sha256-otp.service'

const service = new Sha256OtpService()

describe('Sha256OtpService', () => {
  it('generates a 6-digit code with a matching hash', () => {
    const { code, hash } = service.generate()

    expect(code).toMatch(/^\d{6}$/)
    expect(hash).not.toBe(code)
  })

  it('verifies the generated code against its own hash', () => {
    const { code, hash } = service.generate()

    expect(service.verify(code, hash)).toBe(true)
  })

  it('rejects an incorrect code', () => {
    const { hash } = service.generate()

    expect(service.verify('000000', hash)).toBe(false)
  })

  it('rejects a code compared against a hash of different length without throwing', () => {
    expect(service.verify('123456', 'short')).toBe(false)
  })
})
