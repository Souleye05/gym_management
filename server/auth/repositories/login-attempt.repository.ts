export type AttemptKind = 'LOGIN' | 'OTP_REQUEST'

export type RecordLoginAttemptInput = {
  kind: AttemptKind
  identifier: string
  succeeded: boolean
  staffAccountId?: string
  ipAddress?: string
}

export interface LoginAttemptRepository {
  record(input: RecordLoginAttemptInput): Promise<void>
  /** Counts failed LOGIN attempts for the identifier within the last `sinceMinutesAgo` minutes. */
  countRecentFailures(identifier: string, sinceMinutesAgo: number): Promise<number>
  /** Counts attempts of `kind` for the identifier within the last `sinceMinutesAgo` minutes, regardless of outcome. */
  countRecent(kind: AttemptKind, identifier: string, sinceMinutesAgo: number): Promise<number>
}
