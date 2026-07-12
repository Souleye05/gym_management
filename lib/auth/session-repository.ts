import type { Session } from './types'

const STORAGE_KEY = 'atlas.session'

export type SessionRepository = {
  get(): Promise<Session | null>
  set(session: Session): Promise<void>
  clear(): Promise<void>
}

export const localStorageSessionRepository: SessionRepository = {
  async get() {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Session
    } catch {
      return null
    }
  },

  async set(session) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  },

  async clear() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(STORAGE_KEY)
  },
}
