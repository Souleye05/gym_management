import type { LoginKind } from '../domain/enums'

export type RecordLoginLogInput = {
  kind: LoginKind
  succeeded: boolean
  staffAccountId?: string
  clientAccountId?: string
  reason?: string
  ipAddress?: string
  userAgent?: string
}

export interface LoginLogRepository {
  record(input: RecordLoginLogInput): Promise<void>
}
