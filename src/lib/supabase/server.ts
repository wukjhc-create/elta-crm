import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createJsClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Create a pure anon Supabase client — no cookies, no auth session.
 * Use this for portal operations that must always run as the anon role,
 * even when the browser has authenticated session cookies (e.g. CRM user
 * testing the portal link in the same browser).
 */
export function createAnonClient() {
  return createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/**
 * Perf-review 2026-10-08 (#2): én Auth-opslag pr. request — getUser kaldes af hver gate/permission-tjek (fx 10× i
 * træk på ordresiden). React cache() er request-scoped (Next-dokumentationens DAL-mønster).
 */
export const getUser = cache(getUserUncached)

async function getUserUncached() {
  const supabase = await createClient()
  let { data: { user }, error } = await supabase.auth.getUser()
  // Forbigående Auth-fejl (netværk/429/5xx) må ikke ligne "ikke logget ind" —
  // før gav det AUTH_REQUIRED og en tom side uden besked. Ét nyt forsøg; ægte
  // session-fejl (udløbet/manglende) prøves ikke igen.
  if (!user && error && isTransientAuthError(error)) {
    console.warn('[auth] getUser transient error, retrying', { name: error.name, status: error.status })
    await new Promise((res) => setTimeout(res, 250))
    ;({ data: { user }, error } = await supabase.auth.getUser())
    if (!user && error) {
      console.warn('[auth] getUser failed after retry', { name: error.name, status: error.status })
    }
  }
  return user
}

function isTransientAuthError(error: { status?: number }): boolean {
  if (isAuthRetryableFetchError(error)) return true
  const status = error.status ?? 0
  return status === 0 || status === 429 || status >= 500
}

export async function getUserProfile() {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}
