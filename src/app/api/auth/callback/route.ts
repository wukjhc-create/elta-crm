import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      // Redirect to login with error message
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent('Linket er ugyldigt eller udløbet.')}`
      )
    }

    // Handle password recovery redirect
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }

    // Handle custom next parameter
    if (next) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Default: redirect to dashboard after sign in
  return NextResponse.redirect(`${origin}/dashboard`)
}
