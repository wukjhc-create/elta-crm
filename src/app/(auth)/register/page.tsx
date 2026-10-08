import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Selvregistrering er lukket (P1, 2026-10-07): medarbejdere oprettes kun via invitation (Indstillinger → Brugerstyring).
 * Siden gav før enhver en aktiv montør-konto. NB: Supabase-indstillingen "Allow new users to sign up" skal også slås fra
 * (runbook docs/runbooks/supabase-disable-signup.md) — denne side lukker kun indgangen i appen.
 */
export default function RegisterPage() {
  redirect('/login')
}
