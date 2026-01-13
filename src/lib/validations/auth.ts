import { z } from 'zod'

// Login schema
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail er påkrævet')
    .email('Indtast en gyldig e-mail adresse'),
  password: z
    .string()
    .min(1, 'Adgangskode er påkrævet')
    .min(6, 'Adgangskode skal være mindst 6 tegn'),
})

export type LoginInput = z.infer<typeof loginSchema>

// Register schema
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'E-mail er påkrævet')
      .email('Indtast en gyldig e-mail adresse'),
    password: z
      .string()
      .min(1, 'Adgangskode er påkrævet')
      .min(6, 'Adgangskode skal være mindst 6 tegn')
      .max(100, 'Adgangskode må højst være 100 tegn'),
    confirmPassword: z.string().min(1, 'Bekræft adgangskode'),
    fullName: z
      .string()
      .min(1, 'Fulde navn er påkrævet')
      .min(2, 'Navn skal være mindst 2 tegn')
      .max(100, 'Navn må højst være 100 tegn'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Adgangskoderne matcher ikke',
    path: ['confirmPassword'],
  })

export type RegisterInput = z.infer<typeof registerSchema>

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail er påkrævet')
    .email('Indtast en gyldig e-mail adresse'),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

// Reset password schema
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Adgangskode er påkrævet')
      .min(6, 'Adgangskode skal være mindst 6 tegn')
      .max(100, 'Adgangskode må højst være 100 tegn'),
    confirmPassword: z.string().min(1, 'Bekræft adgangskode'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Adgangskoderne matcher ikke',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
