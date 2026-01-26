'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth'
import { createClient } from '@/lib/supabase/client'
import authTranslations from '@/locales/da/auth.json'

function ResetPasswordFormFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <h1 className="text-3xl font-bold">Validerer...</h1>
        <p className="text-muted-foreground">Vent venligst mens vi bekræfter dit link.</p>
      </div>
    </div>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [isValidSession, setIsValidSession] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  })

  // Validate the recovery session on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        const supabase = createClient()

        // Check if there's a code in the URL (from email link)
        const code = searchParams.get('code')

        if (code) {
          // Exchange the code for a session
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError('Linket er ugyldigt eller udløbet. Anmod om et nyt nulstillingslink.')
            setIsValidating(false)
            return
          }
        }

        // Verify we have a valid session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          setError('Ingen gyldig session fundet. Anmod om et nyt nulstillingslink.')
          setIsValidating(false)
          return
        }

        setIsValidSession(true)
      } catch (err) {
        console.error('Session validation error:', err)
        setError('Der opstod en fejl. Prøv at anmode om et nyt nulstillingslink.')
      } finally {
        setIsValidating(false)
      }
    }

    validateSession()
  }, [searchParams])

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()

      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (updateError) {
        if (updateError.message.includes('same as')) {
          setError('Den nye adgangskode må ikke være den samme som den gamle.')
        } else {
          setError(updateError.message)
        }
        return
      }

      // Sign out after password reset to ensure clean session
      await supabase.auth.signOut()

      setSuccess(true)
    } catch (err) {
      setError(authTranslations.resetPassword.error)
      console.error('Reset password error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while validating session
  if (isValidating) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <h1 className="text-3xl font-bold">Validerer...</h1>
          <p className="text-muted-foreground">Vent venligst mens vi bekræfter dit link.</p>
        </div>
      </div>
    )
  }

  // Show error if session is invalid
  if (!isValidSession && !success) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold">Ugyldigt link</h1>
          <p className="text-muted-foreground">
            {error || 'Linket er ugyldigt eller udløbet.'}
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/forgot-password"
            className="block w-full text-center bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 font-medium"
          >
            Anmod om nyt link
          </Link>
          <Link
            href="/login"
            className="block text-center text-sm text-muted-foreground hover:text-primary"
          >
            {authTranslations.forgotPassword.backToLogin}
          </Link>
        </div>
      </div>
    )
  }

  // Show success message
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
          <h1 className="text-3xl font-bold">Adgangskode ændret!</h1>
          <p className="text-muted-foreground">{authTranslations.resetPassword.success}</p>
        </div>

        <Link
          href="/login"
          className="block w-full text-center bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 font-medium"
        >
          Gå til log ind
        </Link>
      </div>
    )
  }

  // Show reset password form
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{authTranslations.resetPassword.title}</h1>
        <p className="text-muted-foreground">{authTranslations.resetPassword.subtitle}</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            {authTranslations.resetPassword.password}
          </label>
          <input
            {...register('password')}
            id="password"
            type="password"
            placeholder={authTranslations.resetPassword.passwordPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
            autoComplete="new-password"
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            {authTranslations.resetPassword.confirmPassword}
          </label>
          <input
            {...register('confirmPassword')}
            id="confirmPassword"
            type="password"
            placeholder={authTranslations.resetPassword.confirmPasswordPlaceholder}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
            autoComplete="new-password"
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
          {isLoading ? authTranslations.resetPassword.submitting : authTranslations.resetPassword.submit}
        </button>
      </form>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          {authTranslations.forgotPassword.backToLogin}
        </Link>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFormFallback />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
