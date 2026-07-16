// components/providers/my-profile-provider.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { fetchMyClientProfile } from '@/lib/client-portal/fetch-my-profile'
import { mockMyProfile } from '@/lib/client-portal/mock-my-profile'
import type { MyProfile } from '@/lib/client-portal/types'

type MyProfileState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-profile' }
  | { status: 'ready'; profile: MyProfile }

const MyProfileContext = createContext<MyProfileState | null>(null)

export function MyProfileProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['my-client-profile'],
    queryFn: fetchMyClientProfile,
  })

  let state: MyProfileState

  if (query.isPending) {
    state = { status: 'loading' }
  } else if (query.isError) {
    state = { status: 'error', retry: () => query.refetch() }
  } else if (query.data.kind === 'not-linked') {
    state = { status: 'no-profile' }
  } else {
    const profile: MyProfile = {
      client: query.data.client,
      subscription: mockMyProfile.subscription,
      subscriptionStatus: mockMyProfile.subscriptionStatus,
      subscriptionHistory: mockMyProfile.subscriptionHistory,
      sessionHistory: mockMyProfile.sessionHistory,
    }
    state = { status: 'ready', profile }
  }

  return <MyProfileContext.Provider value={state}>{children}</MyProfileContext.Provider>
}

export function useMyProfile(): MyProfileState {
  const ctx = useContext(MyProfileContext)
  if (!ctx) throw new Error('useMyProfile must be used within a MyProfileProvider')
  return ctx
}
