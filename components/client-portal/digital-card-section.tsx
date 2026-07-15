import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientQrCode } from '@/components/scan/client-qr-code'
import { CreditCard } from 'lucide-react'

export function DigitalCardSection({ cardNumber }: { cardNumber: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4" />
          Carte numérique
        </CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center pb-6">
        <ClientQrCode cardNumber={cardNumber} />
      </CardContent>
    </Card>
  )
}
