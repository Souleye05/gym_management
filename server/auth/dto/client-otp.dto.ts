import { z } from 'zod'

export const RequestOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, { message: 'Numéro de téléphone invalide' }),
})

export type RequestOtpDto = z.infer<typeof RequestOtpSchema>

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, { message: 'Numéro de téléphone invalide' }),
  code: z.string().length(6, { message: 'Le code doit contenir 6 chiffres' }),
})

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>
