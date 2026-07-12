export type ClientAccount = {
  id: string
  name: string
  phone: string
}

export const clientDirectory: ClientAccount[] = [
  { id: 'c1', name: 'Yasmine Kaddour', phone: '+33612345601' },
  { id: 'c2', name: 'Marc Delaunay', phone: '+33612345602' },
  { id: 'c3', name: 'Inès Fabre', phone: '+33612345603' },
  { id: 'c4', name: 'Karim Benali', phone: '+33612345604' },
]

export function findClientAccount(phone: string): ClientAccount | null {
  return clientDirectory.find((account) => account.phone === phone) ?? null
}
