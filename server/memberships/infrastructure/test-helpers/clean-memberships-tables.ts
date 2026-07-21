import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all rows from the subscriptions and sessions tables. Call before each integration test for isolation. */
export async function cleanMembershipsTables(): Promise<void> {
  await prismaClient.session.deleteMany()
  await prismaClient.subscription.deleteMany()
}
