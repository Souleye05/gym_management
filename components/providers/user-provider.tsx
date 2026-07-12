'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { currentUser, type CurrentUser } from '@/lib/current-user'

const UserContext = createContext<CurrentUser>(currentUser)

export function UserProvider({ children }: { children: ReactNode }) {
  return <UserContext.Provider value={currentUser}>{children}</UserContext.Provider>
}

export function useCurrentUser(): CurrentUser {
  return useContext(UserContext)
}
