/**
 * Unit-test (ingen netværk) for pilot-review R-2/R-4/R-5/R-6 (lib/auth/auth-error-text.ts).   npx tsx scripts/auth-error-text-test.ts
 */
import { authErrorText, loginUrlErrorText, safeDashboardRedirect } from '../src/lib/auth/auth-error-text'
let bad = 0
const eq = (l: string, g: unknown, w: unknown) => { const ok = g === w; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l} → ${JSON.stringify(g)}${ok ? '' : ` (forventet ${JSON.stringify(w)})`}`) }
eq('user_banned (kode)', authErrorText({ code: 'user_banned', message: 'User is banned' }), 'Din konto er deaktiveret. Kontakt en administrator.')
eq('"User is banned" uden kode', authErrorText({ message: 'User is banned' }), 'Din konto er deaktiveret. Kontakt en administrator.')
eq('rate limit', authErrorText({ message: 'Request rate limit reached' }), 'For mange forsøg på kort tid. Vent et øjeblik og prøv igen.')
eq('same_password', authErrorText({ code: 'same_password', message: 'New password should be different from the old password.' }), 'Den nye adgangskode skal være forskellig fra den gamle.')
eq('weak_password', authErrorText({ code: 'weak_password' }).startsWith('Adgangskoden er for svag'), true)
eq('allerede registreret', authErrorText({ message: 'A user with this email address has already been registered' }).startsWith('Der findes allerede'), true)
eq('ukendt → dansk fallback, ingen engelsk', authErrorText({ message: 'Database error saving new user' }, 'FALLBACK'), 'FALLBACK')
eq('URL-fejlkode kendt', loginUrlErrorText('link_expired'), 'Linket er ugyldigt eller udløbet. Bed om et nyt.')
eq('URL-fritekst afvises (indsprøjtning)', loginUrlErrorText('Kontoen er spærret, ring 12345678'), null)
eq('redirect /dashboard/orders/X?tab=a', safeDashboardRedirect('/dashboard/orders/X?tab=a'), '/dashboard/orders/X?tab=a')
eq('redirect //evil.com afvises', safeDashboardRedirect('//evil.com'), null)
eq('redirect https://evil.com afvises', safeDashboardRedirect('https://evil.com/dashboard'), null)
eq('redirect /dashboard@evil afvises', safeDashboardRedirect('/dashboard@evil.com'), null)
eq('redirect /login afvises (kun /dashboard)', safeDashboardRedirect('/login'), null)
eq('redirect /dashboardx afvises', safeDashboardRedirect('/dashboardx'), null)
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ auth-tekster ok')
process.exitCode = bad ? 1 : 0
