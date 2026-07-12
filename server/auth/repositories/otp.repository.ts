export type OtpRecord = {
  id: string
  clientAccountId: string
  codeHash: string
  expiresAt: Date
  consumedAt: Date | null
  attempts: number
}

export type CreateOtpInput = {
  clientAccountId: string
  codeHash: string
  expiresAt: Date
}

export interface OtpRepository {
  create(input: CreateOtpInput): Promise<void>
  /** Returns the most recent, unconsumed, unexpired OTP for the account, or null. */
  findLatestValid(clientAccountId: string): Promise<OtpRecord | null>
  incrementAttempts(id: string): Promise<void>
  consume(id: string): Promise<void>
}
