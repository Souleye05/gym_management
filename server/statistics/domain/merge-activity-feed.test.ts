import { describe, expect, it } from 'vitest'
import { mergeActivityFeed, type ActivityFeedSources } from './merge-activity-feed'

const EMPTY: ActivityFeedSources = { subscriptionEvents: [], sessionEvents: [], signupEvents: [], expirationEvents: [] }

describe('mergeActivityFeed', () => {
  it('labels a first-ever subscription as payment, with plan label and amount in detail', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        subscriptionEvents: [
          { id: 's1', clientId: 'c1', clientName: 'Yasmine Kaddour', planId: 'QUARTERLY', amountPaid: 105, createdAt: new Date('2026-07-22T10:00:00Z'), isFirstForClient: true },
        ],
      },
      20,
    )
    expect(result).toEqual([
      { id: 's1', type: 'payment', clientId: 'c1', name: 'Yasmine Kaddour', detail: 'Trimestriel · 105 €', occurredAt: new Date('2026-07-22T10:00:00Z') },
    ])
  })

  it('labels a later subscription for the same client as renewal', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        subscriptionEvents: [
          { id: 's2', clientId: 'c1', clientName: 'Karim Benali', planId: 'ANNUAL', amountPaid: 350, createdAt: new Date('2026-07-22T10:00:00Z'), isFirstForClient: false },
        ],
      },
      20,
    )
    expect(result[0]).toMatchObject({ type: 'renewal', detail: 'Annuel · 350 €' })
  })

  it('distinguishes a subscriber session from a visitor session', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        sessionEvents: [
          { id: 'sess1', clientId: 'c1', name: 'Marc Delaunay', type: 'SUBSCRIBER', checkedInAt: new Date('2026-07-22T09:00:00Z') },
          { id: 'sess2', clientId: null, name: 'Nadia Ferrand', type: 'VISITOR', checkedInAt: new Date('2026-07-22T08:00:00Z') },
        ],
      },
      20,
    )
    expect(result).toEqual([
      { id: 'sess1', type: 'session', clientId: 'c1', name: 'Marc Delaunay', detail: 'Séance validée', occurredAt: new Date('2026-07-22T09:00:00Z') },
      { id: 'sess2', type: 'session', clientId: null, name: 'Nadia Ferrand', detail: 'Séance visiteur', occurredAt: new Date('2026-07-22T08:00:00Z') },
    ])
  })

  it('formats a signup event', () => {
    const result = mergeActivityFeed(
      { ...EMPTY, signupEvents: [{ id: 'c9', clientId: 'c9', name: 'Inès Fabre', createdAt: new Date('2026-07-22T07:00:00Z') }] },
      20,
    )
    expect(result[0]).toEqual({ id: 'c9', type: 'signup', clientId: 'c9', name: 'Inès Fabre', detail: 'Nouveau membre', occurredAt: new Date('2026-07-22T07:00:00Z') })
  })

  it('formats an expiration event using endDate as occurredAt', () => {
    const result = mergeActivityFeed(
      { ...EMPTY, expirationEvents: [{ id: 'sub5', clientId: 'c5', clientName: 'Sofia Moretti', endDate: new Date('2026-07-20T00:00:00Z') }] },
      20,
    )
    expect(result[0]).toEqual({ id: 'sub5', type: 'expired', clientId: 'c5', name: 'Sofia Moretti', detail: 'À relancer', occurredAt: new Date('2026-07-20T00:00:00Z') })
  })

  it('merges all 4 sources sorted by occurredAt descending, most recent first', () => {
    const result = mergeActivityFeed(
      {
        subscriptionEvents: [{ id: 's1', clientId: 'c1', clientName: 'A', planId: 'MONTHLY', amountPaid: 40, createdAt: new Date('2026-07-22T08:00:00Z'), isFirstForClient: true }],
        sessionEvents: [{ id: 'sess1', clientId: 'c2', name: 'B', type: 'SUBSCRIBER', checkedInAt: new Date('2026-07-22T12:00:00Z') }],
        signupEvents: [{ id: 'c3', clientId: 'c3', name: 'C', createdAt: new Date('2026-07-22T06:00:00Z') }],
        expirationEvents: [{ id: 'sub4', clientId: 'c4', clientName: 'D', endDate: new Date('2026-07-22T10:00:00Z') }],
      },
      20,
    )
    expect(result.map((item) => item.id)).toEqual(['sess1', 'sub4', 's1', 'c3'])
  })

  it('truncates to the given limit after sorting', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        signupEvents: [
          { id: 'a', clientId: 'a', name: 'A', createdAt: new Date('2026-07-22T10:00:00Z') },
          { id: 'b', clientId: 'b', name: 'B', createdAt: new Date('2026-07-22T09:00:00Z') },
          { id: 'c', clientId: 'c', name: 'C', createdAt: new Date('2026-07-22T08:00:00Z') },
        ],
      },
      2,
    )
    expect(result.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
