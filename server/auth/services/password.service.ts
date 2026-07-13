export interface PasswordService {
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
}
