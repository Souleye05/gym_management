import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireClientAuth } from '../../auth/http/require-client-auth'

export async function getMyClientProfileController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)
    return NextResponse.json(apiSuccess({ client }))
  })
}
