import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all auth-related rows. Call before each integration test for isolation. */
export async function cleanAuthTables(): Promise<void> {
  await prismaClient.loginLog.deleteMany()
  await prismaClient.loginAttempt.deleteMany()
  await prismaClient.otpCode.deleteMany()
  await prismaClient.refreshToken.deleteMany()
  await prismaClient.clientAccount.deleteMany()
  await prismaClient.staffAccount.deleteMany()
}
