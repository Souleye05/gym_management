import { QrCode } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ScanPage() {
  return (
    <EmptyState
      icon={QrCode}
      title="Scan QR code"
      description="La vérification instantanée du statut client par scan arrive bientôt."
    />
  )
}
