'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { mockMyProfile } from '@/lib/client-portal/mock-my-profile'
import type { MyProfile } from '@/lib/client-portal/types'

type MyProfileContextValue = {
  profile: MyProfile
  status: 'loading' | 'ready'
}

const MyProfileContext = createContext<MyProfileContextValue | null>(null)

export function MyProfileProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    setStatus('ready')
  }, [])

  return (
    <MyProfileContext.Provider value={{ profile: mockMyProfile, status }}>
      {children}
    </MyProfileContext.Provider>
  )
}

export function useMyProfile(): MyProfileContextValue {
  const ctx = useContext(MyProfileContext)
  if (!ctx) throw new Error('useMyProfile must be used within a MyProfileProvider')
  return ctx
}
