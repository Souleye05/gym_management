import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'

export async function listClientsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { searchParams } = new URL(req.url)
    const cardNumber = searchParams.get('cardNumber')
    const phone = searchParams.get('phone')
    const q = searchParams.get('q')

    const { clientService } = getContainer()

    if (cardNumber) {
      const client = await clientService.findByCardNumber(cardNumber)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    if (phone) {
      const client = await clientService.findByPhone(phone)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    const clients = await clientService.listClients(q ?? undefined)
    return NextResponse.json(apiSuccess({ clients }))
  })
}
