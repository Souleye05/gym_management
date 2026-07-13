// components/providers/subscriptions-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { PLANS } from '@/lib/subscriptions/plans'
import { computeStartDate } from '@/lib/subscriptions/status'
import { mockSubscriptions } from '@/lib/subscriptions/mock-subscriptions'
import type { PaymentMethod, PlanId, Subscription } from '@/lib/subscriptions/types'

type CreateOrRenewInput = {
  planId: PlanId
  paymentMethod: PaymentMethod
}

type SubscriptionsContextValue = {
  subscriptions: Subscription[]
  createSubscription(input: { clientId: string } & CreateOrRenewInput): Subscription
  renewSubscription(clientId: string, input: CreateOrRenewInput): Subscription
  suspendSubscription(subscriptionId: string): void
  reactivateSubscription(subscriptionId: string): void
  getCurrentSubscription(clientId: string): Subscription | undefined
  getSubscriptionHistory(clientId: string): Subscription[]
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null)

function findCurrentByEndDate(
  subscriptions: Subscription[],
  clientId: string,
): Subscription | undefined {
  return subscriptions
    .filter((s) => s.clientId === clientId)
    .reduce<Subscription | undefined>((latest, candidate) => {
      if (!latest) return candidate
      return new Date(candidate.endDate).getTime() > new Date(latest.endDate).getTime()
        ? candidate
        : latest
    }, undefined)
}

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => [...mockSubscriptions])

  const getCurrentSubscription = useCallback(
    (clientId: string) => findCurrentByEndDate(subscriptions, clientId),
    [subscriptions],
  )

  const getSubscriptionHistory = useCallback(
    (clientId: string) =>
      subscriptions
        .filter((s) => s.clientId === clientId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [subscriptions],
  )

  const buildSubscription = useCallback(
    (clientId: string, input: CreateOrRenewInput): Subscription => {
      const now = new Date()
      const current = findCurrentByEndDate(subscriptions, clientId)
      const start = computeStartDate(current, now)
      const plan = PLANS.find((p) => p.id === input.planId)
      if (!plan) throw new Error(`Unknown planId: ${input.planId}`)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + plan.durationDays)
      return {
        id: `sub${Date.now()}`,
        clientId,
        planId: input.planId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        suspended: false,
        amountPaid: plan.price,
        paymentMethod: input.paymentMethod,
        createdAt: now.toISOString(),
      }
    },
    [subscriptions],
  )

  const createSubscription = useCallback(
    (input: { clientId: string } & CreateOrRenewInput) => {
      const created = buildSubscription(input.clientId, input)
      setSubscriptions((prev) => [...prev, created])
      return created
    },
    [buildSubscription],
  )

  const renewSubscription = useCallback(
    (clientId: string, input: CreateOrRenewInput) => {
      const created = buildSubscription(clientId, input)
      setSubscriptions((prev) => [...prev, created])
      return created
    },
    [buildSubscription],
  )

  const suspendSubscription = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subscriptionId ? { ...s, suspended: true } : s)),
    )
  }, [])

  const reactivateSubscription = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subscriptionId ? { ...s, suspended: false } : s)),
    )
  }, [])

  return (
    <SubscriptionsContext.Provider
      value={{
        subscriptions,
        createSubscription,
        renewSubscription,
        suspendSubscription,
        reactivateSubscription,
        getCurrentSubscription,
        getSubscriptionHistory,
      }}
    >
      {children}
    </SubscriptionsContext.Provider>
  )
}

export function useSubscriptions(): SubscriptionsContextValue {
  const ctx = useContext(SubscriptionsContext)
  if (!ctx) throw new Error('useSubscriptions must be used within a SubscriptionsProvider')
  return ctx
}
