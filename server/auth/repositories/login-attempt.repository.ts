export type RecordLoginAttemptInput = {
  identifier: string
  succeeded: boolean
  staffAccountId?: string
  ipAddress?: string
}

export interface LoginAttemptRepository {
  record(input: RecordLoginAttemptInput): Promise<void>
  /** Counts failed attempts for the identifier within the last `sinceMinutesAgo` minutes. */
  countRecentFailures(identifier: string, sinceMinutesAgo: number): Promise<number>
}
