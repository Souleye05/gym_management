// prisma/seed.ts
import { Role } from '../lib/generated/prisma/client'
import argon2 from 'argon2'
import { prismaClient as prisma } from '../server/shared/prisma-client'

const STAFF_SEED = [
  { email: 'admin@atlas.fit', password: 'admin123', name: 'Admin Studio', role: Role.ADMIN },
  { email: 'agent@atlas.fit', password: 'agent123', name: 'Agent Caisse', role: Role.AGENT },
]

const CLIENT_ACCOUNT_SEED = [
  { phone: '+33612345601', name: 'Yasmine Kaddour', linkToClient: true },
  { phone: '+33612345602', name: 'Marc Delaunay', linkToClient: true },
  { phone: '+33612345603', name: 'Inès Fabre', linkToClient: true },
  { phone: '+33612345604', name: 'Karim Benali', linkToClient: false },
]

async function main() {
  for (const staff of STAFF_SEED) {
    const passwordHash = await argon2.hash(staff.password)
    await prisma.staffAccount.upsert({
      where: { email: staff.email },
      update: { passwordHash, name: staff.name, role: staff.role },
      create: { email: staff.email, passwordHash, name: staff.name, role: staff.role },
    })
  }

  for (const seed of CLIENT_ACCOUNT_SEED) {
    const account = await prisma.clientAccount.upsert({
      where: { phone: seed.phone },
      update: { name: seed.name },
      create: { phone: seed.phone, name: seed.name },
    })

    if (seed.linkToClient) {
      const existingClient = await prisma.client.findUnique({ where: { clientAccountId: account.id } })
      if (!existingClient) {
        await prisma.client.create({
          data: { name: seed.name, phone: seed.phone, clientAccountId: account.id },
        })
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
