import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function SeancesPage() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="Séances journalières"
      description="L'enregistrement et l'historique des séances arrivent bientôt."
    />
  )
}
