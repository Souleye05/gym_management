import type { Session } from '../domain/entities'

export interface SessionRepository {
  /** The N most recent sessions for a client, ordered by checkedInAt descending. */
  findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
}
