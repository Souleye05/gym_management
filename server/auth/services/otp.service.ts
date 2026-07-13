export interface OtpService {
  generate(): { code: string; hash: string }
  verify(plain: string, hash: string): boolean
}
