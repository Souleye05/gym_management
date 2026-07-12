import { CreditCard } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function AbonnementsPage() {
  return (
    <EmptyState
      icon={CreditCard}
      title="Gestion des abonnements"
      description="La création, le renouvellement et le suivi des abonnements arrivent bientôt."
    />
  )
}
