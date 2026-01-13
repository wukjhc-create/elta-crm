'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { createClient } from '@/lib/supabase/client'
import authTranslations from '@/locales/da/auth.json'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError(authTranslations.login.error)
        } else if (authError.message.includes('Email not confirmed')) {
          setError(authTranslations.errors.emailNotConfirmed)
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(authTranslations.login.errorGeneric)
      console.error('Login error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{authTranslations.login.title}</h1>
        <p className="text-muted-foreground">{authTranslations.login.subtitle}</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {authTranslations.login.email}
          </label>
          <input
            {...register('email')}
            id="email"
            type="email"
            placeholder={authTranslations.login.emailPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              {authTranslations.login.password}
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              {authTranslations.login.forgotPassword}
            </Link>
          </div>
          <input
            {...register('password')}
            id="password"
            type="password"
            placeholder={authTranslations.login.passwordPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isLoading ? authTranslations.login.submitting : authTranslations.login.submit}
        </button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">{authTranslations.login.noAccount} </span>
        <Link href="/register" className="text-primary hover:underline font-medium">
          {authTranslations.login.signUp}
        </Link>
      </div>
    </div>
  )
}
