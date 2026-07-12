import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Role } from '../lib/generated/prisma/client'
import argon2 from 'argon2'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const STAFF_SEED = [
  { email: 'admin@atlas.fit', password: 'admin123', name: 'Admin Studio', role: Role.ADMIN },
  { email: 'agent@atlas.fit', password: 'agent123', name: 'Agent Caisse', role: Role.AGENT },
]

const CLIENT_SEED = [
  { phone: '+33612345601', name: 'Yasmine Kaddour' },
  { phone: '+33612345602', name: 'Marc Delaunay' },
  { phone: '+33612345603', name: 'Inès Fabre' },
  { phone: '+33612345604', name: 'Karim Benali' },
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

  for (const client of CLIENT_SEED) {
    await prisma.clientAccount.upsert({
      where: { phone: client.phone },
      update: { name: client.name },
      create: { phone: client.phone, name: client.name },
    })
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
