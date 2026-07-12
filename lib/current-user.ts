export type Role = 'admin' | 'agent'

export type CurrentUser = {
  id: string
  name: string
  role: Role
  email: string
}

export const currentUser: CurrentUser = {
  id: 'u1',
  name: 'Admin Studio',
  role: 'admin',
  email: 'admin@atlas.fit',
}
