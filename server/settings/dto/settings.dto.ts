import { z } from 'zod'

export const UpdateSettingsSchema = z.object({
  sessionPrice: z.number().int().positive({ message: 'Le prix de la séance doit être un entier positif' }),
})

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>
