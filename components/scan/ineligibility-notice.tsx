'use client'

import { Button } from '@/components/ui/button'
import type { SessionEligibility } from '@/lib/sessions/eligibility'

const REASON_MESSAGES: Record<'expired' | 'suspended' | 'none', string> = {
  expired: 'Abonnement expiré.',
  suspended: 'Abonnement suspendu.',
  none: 'Aucun abonnement.',
}

export function IneligibilityNotice({
  eligibility,
  onRenew,
  onCreateSubscription,
  onDailySession,
  onViewProfile,
}: {
  eligibility: SessionEligibility & { allowed: false }
  onRenew?: () => void
  onCreateSubscription?: () => void
  onDailySession?: () => void
  onViewProfile?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm font-medium text-destructive">{REASON_MESSAGES[eligibility.reason]}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {eligibility.reason === 'expired' && onRenew && (
          <Button size="sm" onClick={onRenew}>
            Renouveler l'abonnement
          </Button>
        )}
        {eligibility.reason === 'none' && (
          <>
            {onCreateSubscription && (
              <Button size="sm" onClick={onCreateSubscription}>
                Créer un abonnement
              </Button>
            )}
            {onDailySession && (
              <Button size="sm" variant="outline" onClick={onDailySession}>
                Nouvelle séance journalière
              </Button>
            )}
          </>
        )}
        {eligibility.reason === 'suspended' && onViewProfile && (
          <Button size="sm" variant="outline" onClick={onViewProfile}>
            Voir la fiche client
          </Button>
        )}
      </div>
    </div>
  )
}
