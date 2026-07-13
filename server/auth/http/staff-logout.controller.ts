import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { clearAuthCookies, readRefreshTokenCookie } from '../../shared/cookies'
import { getContainer } from '../../shared/container'

export async function staffLogoutController(req: NextRequest): Promise<NextResponse> {
  const refreshToken = readRefreshTokenCookie(req)

  if (refreshToken) {
    const { staffAuthService } = getContainer()
    await staffAuthService.logout(refreshToken)
  }

  const response = NextResponse.json(apiSuccess(null, 'Déconnexion réussie'))
  clearAuthCookies(response)
  return response
}
