/**
 * Test Harness — ENVIRONMENT SAFEGUARD (vigtigste sikkerhedsdel).
 *
 * Harness MAA ALDRIG koere data-generering mod production. Denne guard
 * HARD-BLOKERER medmindre et EKSPLICIT test/staging-target er sat, som
 * beviseligt ikke er production.
 *
 * Kraev (alle skal vaere opfyldt):
 *   - HARNESS_SUPABASE_URL sat OG != production URL/ref
 *   - HARNESS_SUPABASE_SERVICE_ROLE_KEY sat
 *   - HARNESS_CONFIRM === 'I_UNDERSTAND_TEST_ONLY'
 *   - NODE_ENV != 'production'
 *   - URL ligner test/staging (medmindre HARNESS_ALLOW_ANY=true bevidst)
 *
 * evaluateHarnessTarget() er ren (til test); assertSafeHarnessTarget() kaster.
 */

export const HARNESS_CONFIRM_TOKEN = 'I_UNDERSTAND_TEST_ONLY'

export interface HarnessTargetEval {
  ok: boolean
  reason?: string
  url?: string
  serviceKey?: string
}

function refOf(url: string): string | undefined {
  return url.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1]
}

export function evaluateHarnessTarget(env: Record<string, string | undefined>): HarnessTargetEval {
  const prodUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const url = (env.HARNESS_SUPABASE_URL || '').trim()
  const key = (env.HARNESS_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const confirm = (env.HARNESS_CONFIRM || '').trim()

  if ((env.NODE_ENV || '').toLowerCase() === 'production') {
    return { ok: false, reason: 'NODE_ENV=production' }
  }
  if (!url) {
    return { ok: false, reason: 'HARNESS_SUPABASE_URL ikke sat (kraever eksplicit test/staging-DB)' }
  }
  if (!/^https:\/\/.+/.test(url)) {
    return { ok: false, reason: 'HARNESS_SUPABASE_URL er ikke en gyldig https-URL' }
  }
  if (!key) {
    return { ok: false, reason: 'HARNESS_SUPABASE_SERVICE_ROLE_KEY ikke sat' }
  }
  if (confirm !== HARNESS_CONFIRM_TOKEN) {
    return { ok: false, reason: `HARNESS_CONFIRM skal vaere "${HARNESS_CONFIRM_TOKEN}"` }
  }
  if (prodUrl && url === prodUrl) {
    return { ok: false, reason: 'HARNESS_SUPABASE_URL er identisk med production URL' }
  }
  const pRef = refOf(prodUrl)
  const hRef = refOf(url)
  if (pRef && hRef && pRef === hRef) {
    return { ok: false, reason: 'HARNESS target-ref er identisk med production-ref' }
  }
  if (!/(test|staging|dev|local)/i.test(url) && (env.HARNESS_ALLOW_ANY || '') !== 'true') {
    return {
      ok: false,
      reason: 'HARNESS_SUPABASE_URL ligner ikke test/staging (saet HARNESS_ALLOW_ANY=true hvis bevidst og verificeret ikke-prod)',
    }
  }
  return { ok: true, url, serviceKey: key }
}

export function assertSafeHarnessTarget(env: Record<string, string | undefined> = process.env): {
  url: string
  serviceKey: string
} {
  const e = evaluateHarnessTarget(env)
  if (!e.ok) {
    throw new Error(
      `Test Harness BLOKERET af safeguard: ${e.reason}. ` +
        `Harness maa ALDRIG koere data-generering mod production. ` +
        `Etabler en dedikeret test/staging-database og saet HARNESS_SUPABASE_URL, ` +
        `HARNESS_SUPABASE_SERVICE_ROLE_KEY og HARNESS_CONFIRM=${HARNESS_CONFIRM_TOKEN}.`,
    )
  }
  return { url: e.url!, serviceKey: e.serviceKey! }
}
