import { z } from 'zod'

export const StaffLoginSchema = z.object({
  email: z.string().email({ message: 'Adresse e-mail incorrecte' }),
  password: z.string().min(1, { message: 'Mot de passe requis' }),
})

export type StaffLoginDto = z.infer<typeof StaffLoginSchema>
