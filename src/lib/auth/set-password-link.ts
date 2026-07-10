import { createAdminClient } from '@/lib/supabase/admin'

// Delt helper til "sæt/nulstil adgangskode"-links. Ligger i en neutral modul-
// fil (IKKE 'use server') så både medarbejder-invite-flowet (employee-login.ts)
// og den offentlige glemt-adgangskode-selvbetjening (password-reset.ts) kan
// genbruge nøjagtig samme mønster. action_link peger på /reset-password, som
// håndterer BÅDE recovery- og invite-token.

export function resetPasswordRedirect(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return `${base}/reset-password`
}

// Genererer et Supabase recovery-link for en EKSISTERENDE auth-bruger. Sender
// INGEN mail — kun linket. Returnerer { link: null } hvis brugeren ikke findes
// eller genereringen fejler.
export async function buildSetPasswordLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ link: string | null; error?: string }> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: resetPasswordRedirect() },
  })
  const link =
    (data as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? null
  if (error || !link) return { link: null, error: error?.message ?? 'Kunne ikke generere link' }
  return { link }
}
