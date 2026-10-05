/**
 * PRODUCTION read-only: er selvregistrering slået til i prod-Supabase Auth? (auth-review P1, 2026-10-05)
 *
 * Henter den OFFENTLIGE anon-nøgle og Supabase-URL fra den deployede apps JavaScript (de er offentlige pr. design —
 * NEXT_PUBLIC_*) og kalder Auths offentlige, skrivebeskyttede `GET /auth/v1/settings`. Opretter intet, logger intet ind.
 * Printer KUN ja/nej-felter — aldrig nøgler eller URL'er.
 *   npx tsx scripts/prod-auth-signup-status.ts [https://elta-crm.vercel.app]
 */
const APP = (process.argv[2] || 'https://elta-crm.vercel.app').replace(/\/+$/, '')

async function main() {
  const html = await (await fetch(`${APP}/login`)).text()
  // Next 16: /_next/static/immutable/chunks/…; stier kan have ?dpl=…-suffiks
  const chunks = Array.from(new Set(Array.from(html.matchAll(/\/?_next\/static\/(?:immutable\/)?chunks\/[^"'?\s]+\.js(?:\?[^"'\s]*)?/g))
    .map((m) => (m[0].startsWith('/') ? m[0] : `/${m[0]}`))))
  let supabaseUrl: string | null = null
  let anonKey: string | null = null
  for (const c of chunks) {
    const js = await (await fetch(`${APP}${c}`)).text()
    supabaseUrl ??= js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null
    // anon-nøglen er en JWT med role "anon"
    for (const m of js.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g)) {
      try {
        const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'))
        if (payload.role === 'anon') { anonKey = m[0]; break }
      } catch { /* ikke en JWT */ }
    }
    if (supabaseUrl && anonKey) break
  }
  if (!supabaseUrl || !anonKey) {
    console.log(JSON.stringify({ ok: false, reason: 'kunne ikke finde offentlig Supabase-URL/anon-nøgle i appens JS', chunks: chunks.length }))
    process.exitCode = 1
    return
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } })
  const s = (await res.json()) as { disable_signup?: boolean; mailer_autoconfirm?: boolean; external?: Record<string, boolean> }
  const providers = Object.entries(s.external ?? {}).filter(([, v]) => v).map(([k]) => k)
  const { KNOWN_PRODUCTION_REFS } = await import('./test-harness/env-guard')
  const ref = supabaseUrl.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? ''
  console.log(JSON.stringify({
    ok: res.ok,
    er_prod_projekt: KNOWN_PRODUCTION_REFS.includes(ref),
    selvregistrering_slaaet_til: s.disable_signup === false,
    disable_signup: s.disable_signup ?? null,
    email_autobekraeftelse: s.mailer_autoconfirm ?? null,
    aktive_login_udbydere: providers,
  }))
}
main().catch((e) => { console.error(String(e?.message ?? e).replace(/eyJ[\w.-]+/g, '<jwt>')); process.exitCode = 1 })
