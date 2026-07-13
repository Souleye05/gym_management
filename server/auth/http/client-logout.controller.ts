import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { clearAuthCookies, readRefreshTokenCookie } from '../../shared/cookies'
import { getContainer } from '../../shared/container'

export async function clientLogoutController(req: NextRequest): Promise<NextResponse> {
  const refreshToken = readRefreshTokenCookie(req)

  if (refreshToken) {
    const { clientAuthService } = getContainer()
    await clientAuthService.logout(refreshToken)
  }

  const response = NextResponse.json(apiSuccess(null, 'Déconnexion réussie'))
  clearAuthCookies(response)
  return response
}
