/**
 * Test Harness — ENVIRONMENT SAFEGUARD (vigtigste sikkerhedsdel).
 *
 * Credentials er OPDELT saa runtime-simulation ALDRIG kraever et Supabase
 * Management API-token:
 *
 *   A. BOOTSTRAP (kun schema/migrationer): assertBootstrapConfig()
 *      - HARNESS_SUPABASE_ACCESS_TOKEN (management) + service_role
 *      - bruges KUN til at oprette/anvende/verificere migrationer paa staging
 *      - MAA fjernes igen efter schema er etableret (se docs)
 *
 *   B. RUNTIME (generator/scenario-runner/load): assertRuntimeConfig()
 *      - HARNESS_SUPABASE_URL, HARNESS_SUPABASE_ANON_KEY,
 *        HARNESS_SUPABASE_SERVICE_ROLE_KEY, HARNESS_CONFIRM
 *      - INTET management-token
 *
 * FAIL-CLOSED: ingen fallback til NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ACCESS_TOKEN / .env.local-prod. Staging
 * skal bevises (url+ref != prod), ellers stop. Secrets logges/rapporteres ALDRIG.
 */

export const HARNESS_CONFIRM_TOKEN = 'I_UNDERSTAND_TEST_ONLY'

/** Maskér en secret til diagnostics — afsloerer ALDRIG indhold, kun laengde. */
export function maskSecret(s?: string): string {
  if (!s) return '(unset)'
  return `set(len=${s.length})`
}

/** Sikkerheds-evaluering (INGEN secrets). Bruges af begge asserts. */
export interface HarnessSafetyEval {
  ok: boolean
  reason?: string
  url?: string
}

function refOf(url: string): string | undefined {
  return url.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1]
}

export function evaluateHarnessTarget(env: Record<string, string | undefined>): HarnessSafetyEval {
  const prodUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const url = (env.HARNESS_SUPABASE_URL || '').trim()
  const confirm = (env.HARNESS_CONFIRM || '').trim()

  if ((env.NODE_ENV || '').toLowerCase() === 'production') return { ok: false, reason: 'NODE_ENV=production' }
  if (!url) return { ok: false, reason: 'HARNESS_SUPABASE_URL ikke sat (kraever eksplicit test/staging-DB)' }
  if (!/^https:\/\/.+/.test(url)) return { ok: false, reason: 'HARNESS_SUPABASE_URL er ikke en gyldig https-URL' }
  if (confirm !== HARNESS_CONFIRM_TOKEN) return { ok: false, reason: `HARNESS_CONFIRM skal vaere "${HARNESS_CONFIRM_TOKEN}"` }
  if (prodUrl && url === prodUrl) return { ok: false, reason: 'HARNESS_SUPABASE_URL er identisk med production URL' }
  const pRef = refOf(prodUrl)
  const hRef = refOf(url)
  if (pRef && hRef && pRef === hRef) return { ok: false, reason: 'HARNESS target-ref er identisk med production-ref' }
  if (!/(test|staging|dev|local)/i.test(url) && (env.HARNESS_ALLOW_ANY || '') !== 'true') {
    return { ok: false, reason: 'HARNESS_SUPABASE_URL ligner ikke test/staging (saet HARNESS_ALLOW_ANY=true hvis bevidst og verificeret ikke-prod)' }
  }
  return { ok: true, url }
}

function assertSafety(env: Record<string, string | undefined>): string {
  const e = evaluateHarnessTarget(env)
  if (!e.ok) {
    throw new Error(
      `Test Harness BLOKERET af safeguard: ${e.reason}. Harness maa ALDRIG koere mod production.`,
    )
  }
  return e.url!
}

// ---------------------------------------------------------------------
// B. RUNTIME (ingen management-token)
// ---------------------------------------------------------------------
export interface RuntimeConfig {
  url: string
  anonKey: string
  serviceKey: string
}

export function assertRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const url = assertSafety(env)
  const anonKey = (env.HARNESS_SUPABASE_ANON_KEY || '').trim()
  const serviceKey = (env.HARNESS_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!anonKey) throw new Error('Test Harness runtime: HARNESS_SUPABASE_ANON_KEY ikke sat')
  if (!serviceKey) throw new Error('Test Harness runtime: HARNESS_SUPABASE_SERVICE_ROLE_KEY ikke sat')
  // FAIL-CLOSED: aldrig genbrug af production service-role.
  if (env.SUPABASE_SERVICE_ROLE_KEY && serviceKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Test Harness runtime: HARNESS service-role er identisk med PRODUCTION service-role — afvist')
  }
  return { url, anonKey, serviceKey }
}

// ---------------------------------------------------------------------
// A. BOOTSTRAP (kun schema/migrationer)
// ---------------------------------------------------------------------
export interface BootstrapConfig {
  url: string
  serviceKey: string
  accessToken: string
}

export function assertBootstrapConfig(env: Record<string, string | undefined> = process.env): BootstrapConfig {
  const url = assertSafety(env)
  const serviceKey = (env.HARNESS_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const accessToken = (env.HARNESS_SUPABASE_ACCESS_TOKEN || '').trim()
  if (!serviceKey) throw new Error('Test Harness bootstrap: HARNESS_SUPABASE_SERVICE_ROLE_KEY ikke sat')
  if (!accessToken) throw new Error('Test Harness bootstrap: HARNESS_SUPABASE_ACCESS_TOKEN ikke sat')
  // FAIL-CLOSED: aldrig genbrug af production management-token / service-role.
  if (env.SUPABASE_ACCESS_TOKEN && accessToken === env.SUPABASE_ACCESS_TOKEN) {
    throw new Error('Test Harness bootstrap: HARNESS access-token er identisk med PRODUCTION token — afvist')
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && serviceKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Test Harness bootstrap: HARNESS service-role er identisk med PRODUCTION service-role — afvist')
  }
  return { url, serviceKey, accessToken }
}
