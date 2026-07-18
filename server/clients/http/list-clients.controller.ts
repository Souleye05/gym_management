// server/clients/http/list-clients.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { DEFAULT_LIST_ACTIVE_LIMIT } from '../repositories/client.repository'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

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

    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = parsePositiveInt(searchParams.get('limit'), DEFAULT_LIST_ACTIVE_LIMIT)

    const result = await clientService.listClients(q ?? undefined, { page, limit })
    return NextResponse.json(apiSuccess(result))
  })
}
