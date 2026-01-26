import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Log ind - Elta CRM',
  description: 'Log ind på din Elta CRM konto',
}

function LoginFormFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2 text-center">
        <div className="h-9 w-32 bg-muted rounded mx-auto" />
        <div className="h-5 w-64 bg-muted rounded mx-auto" />
      </div>
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  )
}
