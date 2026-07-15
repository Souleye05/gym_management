import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all rows from the clients table. Call before each integration test for isolation. */
export async function cleanClientsTable(): Promise<void> {
  await prismaClient.client.deleteMany()
}
