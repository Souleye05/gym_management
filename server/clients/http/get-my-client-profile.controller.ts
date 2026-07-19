// server/clients/http/get-my-client-profile.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireClientAuth } from '../../auth/http/require-client-auth'

export async function getMyClientProfileController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService, clientHistoryService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)

    if (!client) {
      return NextResponse.json(apiSuccess({
        client: null,
        subscription: null,
        subscriptionHistory: [],
        sessionHistory: [],
      }))
    }

    const history = await clientHistoryService.getHistory(client.id)
    return NextResponse.json(apiSuccess({
      client,
      subscription: history.currentSubscription,
      subscriptionHistory: history.subscriptions,
      sessionHistory: history.recentSessions,
    }))
  })
}
