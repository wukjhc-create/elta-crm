'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, type RegisterInput } from '@/lib/validations/auth'
import { createClient } from '@/lib/supabase/client'
import authTranslations from '@/locales/da/auth.json'
import { ENABLE_EMAIL_VERIFICATION } from '@/lib/constants'

export function RegisterForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            role: 'user', // Default role
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError(authTranslations.register.emailExists)
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        if (ENABLE_EMAIL_VERIFICATION && !authData.user.confirmed_at) {
          setSuccess(true)
        } else {
          // Auto-login if email verification is disabled
          router.push('/dashboard')
          router.refresh()
        }
      }
    } catch (err) {
      setError(authTranslations.register.error)
      console.error('Registration error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold">{authTranslations.verification.title}</h1>
          <p className="text-muted-foreground">{authTranslations.verification.message}</p>
        </div>

        <div className="text-center">
          <Link
            href="/login"
            className="text-primary hover:underline font-medium"
          >
            {authTranslations.verification.backToLogin}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{authTranslations.register.title}</h1>
        <p className="text-muted-foreground">{authTranslations.register.subtitle}</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium">
            {authTranslations.register.fullName}
          </label>
          <input
            {...register('fullName')}
            id="fullName"
            type="text"
            placeholder={authTranslations.register.fullNamePlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {authTranslations.register.email}
          </label>
          <input
            {...register('email')}
            id="email"
            type="email"
            placeholder={authTranslations.register.emailPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            {authTranslations.register.password}
          </label>
          <input
            {...register('password')}
            id="password"
            type="password"
            placeholder={authTranslations.register.passwordPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            {authTranslations.register.confirmPassword}
          </label>
          <input
            {...register('confirmPassword')}
            id="confirmPassword"
            type="password"
            placeholder={authTranslations.register.confirmPasswordPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isLoading ? authTranslations.register.submitting : authTranslations.register.submit}
        </button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">{authTranslations.register.hasAccount} </span>
        <Link href="/login" className="text-primary hover:underline font-medium">
          {authTranslations.register.signIn}
        </Link>
      </div>
    </div>
  )
}
