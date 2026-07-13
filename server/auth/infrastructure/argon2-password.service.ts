import argon2 from 'argon2'
import type { PasswordService } from '../services/password.service'

export class Argon2PasswordService implements PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain)
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain)
    } catch {
      return false
    }
  }
}
