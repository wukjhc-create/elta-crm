/**
 * Pilot-review 2026-10-15 (R-2/R-4/R-6): Supabase Auth-fejl vist som rå engelsk ("User is banned", "Email rate limit
 * exceeded", "New password should be different…"), og login-siden viste vilkårlig tekst fra ?error=. Ét sted med faste
 * danske tekster pr. fejlkode. Bevidst IKKE 'use server' (bruges i klientkomponenter).
 */

type AuthLikeError = { code?: string | null; message?: string | null; status?: number | null } | null | undefined

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Forkert e-mail eller adgangskode.',
  user_banned: 'Din konto er deaktiveret. Kontakt en administrator.',
  email_not_confirmed: 'Din e-mail er ikke bekræftet endnu. Tjek din indbakke.',
  over_request_rate_limit: 'For mange forsøg på kort tid. Vent et øjeblik og prøv igen.',
  over_email_send_rate_limit: 'Der er sendt for mange mails på kort tid. Vent et par minutter og prøv igen.',
  same_password: 'Den nye adgangskode skal være forskellig fra den gamle.',
  weak_password: 'Adgangskoden er for svag. Brug mindst 8 tegn med en blanding af bogstaver og tal.',
  email_exists: 'Der findes allerede en bruger med denne e-mail — brug "Knyt eksisterende bruger".',
  user_already_exists: 'Der findes allerede en bruger med denne e-mail — brug "Knyt eksisterende bruger".',
  otp_expired: 'Linket er ugyldigt eller udløbet. Bed om et nyt.',
  session_not_found: 'Din session er udløbet. Log ind igen.',
}

/** Ældre Supabase-versioner sender ikke altid `code` — kendte engelske tekster mappes også */
const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/banned/i, BY_CODE.user_banned],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/email rate limit/i, BY_CODE.over_email_send_rate_limit],
  [/rate limit/i, BY_CODE.over_request_rate_limit],
  [/different from the old password|same as/i, BY_CODE.same_password],
  [/weak|password should be at least|password should contain/i, BY_CODE.weak_password],
  [/already (been )?registered|already exists/i, BY_CODE.email_exists],
  [/expired|invalid.*(link|token|otp)/i, BY_CODE.otp_expired],
]

export function authErrorText(err: AuthLikeError, fallback = 'Der opstod en fejl. Prøv igen — fortsætter det, kontakt en administrator.'): string {
  if (!err) return fallback
  if (err.code && BY_CODE[err.code]) return BY_CODE[err.code]
  const msg = err.message ?? ''
  for (const [re, text] of BY_MESSAGE) if (re.test(msg)) return text
  return fallback
}

/** R-6: kun kendte fejlkoder fra URL'en vises — aldrig vilkårlig tekst (indsprøjtning på login-siden) */
export const LOGIN_URL_ERRORS: Record<string, string> = {
  link_expired: 'Linket er ugyldigt eller udløbet. Bed om et nyt.',
  deactivated: 'Din konto er deaktiveret. Kontakt en administrator.',
  session_expired: 'Din session er udløbet. Log ind igen.',
}

export function loginUrlErrorText(code: string | null | undefined): string | null {
  if (!code) return null
  return LOGIN_URL_ERRORS[code] ?? null
}

/** R-5: kun interne stier under /dashboard (samme regel som auth-callback — ingen "//evil", "\\", "@") */
export function safeDashboardRedirect(path: string | null | undefined): string | null {
  if (!path) return null
  if (!/^\/dashboard(\/|$|\?)/.test(path)) return null
  if (/^\/[\/\\]/.test(path) || /[@\\]/.test(path.split('?')[0])) return null
  return path
}
