import { z } from 'zod'

const PHONE_PATTERN = /^\+\d{8,15}$/

export const CreateClientSchema = z.object({
  name: z.string().trim().min(1, { message: 'Le nom est requis' }),
  phone: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }),
  email: z.string().email({ message: 'Adresse e-mail invalide' }).optional(),
})

export type CreateClientDto = z.infer<typeof CreateClientSchema>

export const UpdateClientSchema = z.object({
  name: z.string().trim().min(1, { message: 'Le nom est requis' }).optional(),
  phone: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }).optional(),
  email: z.string().email({ message: 'Adresse e-mail invalide' }).nullable().optional(),
})

export type UpdateClientDto = z.infer<typeof UpdateClientSchema>
