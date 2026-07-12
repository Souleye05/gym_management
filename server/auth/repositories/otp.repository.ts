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
  /** Marks the OTP as consumed iff it isn't already. Returns false if it was already consumed. */
  consume(id: string): Promise<boolean>
}
