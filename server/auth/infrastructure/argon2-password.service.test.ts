import { describe, expect, it } from 'vitest'
import { Argon2PasswordService } from './argon2-password.service'

const service = new Argon2PasswordService()

describe('Argon2PasswordService', () => {
  it('hashes a password to a non-plaintext value', async () => {
    const hash = await service.hash('admin123')

    expect(hash).not.toBe('admin123')
    expect(hash.startsWith('$argon2')).toBe(true)
  })

  it('verifies a correct password against its hash', async () => {
    const hash = await service.hash('admin123')

    await expect(service.verify('admin123', hash)).resolves.toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('admin123')

    await expect(service.verify('wrong-password', hash)).resolves.toBe(false)
  })

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(service.verify('admin123', 'not-a-real-hash')).resolves.toBe(false)
  })
})
