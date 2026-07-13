import { createHash, timingSafeEqual } from 'node:crypto'
import type { OtpService } from '../services/otp.service'

/** V1: the OTP code is a fixed, simulated value — no real SMS provider yet (see design doc). */
const SIMULATED_OTP_CODE = '123456'

export class Sha256OtpService implements OtpService {
  generate(): { code: string; hash: string } {
    const code = SIMULATED_OTP_CODE
    return { code, hash: this.hashCode(code) }
  }

  verify(plain: string, hash: string): boolean {
    const plainHash = Buffer.from(this.hashCode(plain))
    const storedHash = Buffer.from(hash)
    if (plainHash.length !== storedHash.length) return false
    return timingSafeEqual(plainHash, storedHash)
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex')
  }
}
