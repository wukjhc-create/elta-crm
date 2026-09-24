/**
 * Test Harness — ENVIRONMENT SAFEGUARD (vigtigste sikkerhedsdel).
 *
 * Config laeses fra en lokal, gitignored JSON-fil (harness.secrets.local.json)
 * — IKKE fra .env.* (policy blokerer .env-laesning, og vi vil undgaa enhver
 * fallback til production-config).
 *
 * IDENTITETS-BASERET FAIL-CLOSED (ingen navne-heuristik, ingen bypass):
 *   - Kendte production-refs/URL'er er EKSPLICIT hard-blocked.
 *   - Staging-URL/ref skal vaere forskellig fra production.
 *   - confirm skal vaere I_UNDERSTAND_TEST_ONLY; environment maa ikke vaere production.
 *
 * Credentials er OPDELT:
 *   A. BOOTSTRAP (kun migrationer): assertBootstrapConfig() — management token + service_role
 *   B. RUNTIME (generator/scenarier/load): assertRuntimeConfig() — url+anon+service_role (INTET token)
 *
 * Secrets logges/rapporteres ALDRIG. maskSecret() viser kun laengde.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

export const HARNESS_CONFIRM_TOKEN = 'I_UNDERSTAND_TEST_ONLY'
export const HARNESS_SECRETS_FILE = 'harness.secrets.local.json'

/** Kendte PRODUCTION-identiteter der ALDRIG maa accepteres som harness-target. */
export const KNOWN_PRODUCTION_REFS: readonly string[] = ['guhsjwewajyonehivffc']

export interface HarnessSecrets {
  supabaseUrl?: string
  anonKey?: string
  serviceRoleKey?: string
  managementAccessToken?: string
  confirm?: string
  environment?: string
}

/** Maskér en secret til diagnostics — afsloerer ALDRIG indhold, kun laengde. */
export function maskSecret(s?: string): string {
  if (!s) return '(unset)'
  return `set(len=${s.length})`
}

/** Laes secrets fra gitignored JSON-fil. Manglende fil => tomt (asserts fail-closer). */
export function loadHarnessSecrets(file = HARNESS_SECRETS_FILE): HarnessSecrets {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), 'utf8')
    const j = JSON.parse(raw)
    return {
      supabaseUrl: j.supabaseUrl,
      anonKey: j.anonKey,
      serviceRoleKey: j.serviceRoleKey,
      managementAccessToken: j.managementAccessToken,
      confirm: j.confirm,
      environment: j.environment,
    }
  } catch {
    return {}
  }
}

function refOf(url: string): string | undefined {
  return url.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1]
}

function productionRefs(env: Record<string, string | undefined>): Set<string> {
  const s = new Set<string>(KNOWN_PRODUCTION_REFS)
  const envRef = refOf((env.NEXT_PUBLIC_SUPABASE_URL || '').trim())
  if (envRef) s.add(envRef)
  return s
}

export interface HarnessSafetyEval {
  ok: boolean
  reason?: string
  url?: string
}

/** Sikkerheds-evaluering (INGEN secrets afsloeres). */
export function evaluateHarnessTarget(
  secrets: HarnessSecrets,
  env: Record<string, string | undefined> = process.env,
): HarnessSafetyEval {
  const url = (secrets.supabaseUrl || '').trim()
  const confirm = (secrets.confirm || '').trim()
  const environment = (secrets.environment || '').trim().toLowerCase()

  if ((env.NODE_ENV || '').toLowerCase() === 'production') return { ok: false, reason: 'NODE_ENV=production' }
  // Fail-closed: environment SKAL eksplicit vaere "staging" (ikke blot != production).
  if (environment !== 'staging') return { ok: false, reason: `environment skal vaere "staging" (er: "${environment || '(tom)'}")` }
  if (!url) return { ok: false, reason: 'supabaseUrl ikke sat i harness.secrets.local.json' }
  if (!/^https:\/\/.+/.test(url)) return { ok: false, reason: 'supabaseUrl er ikke en gyldig https-URL' }
  if (confirm !== HARNESS_CONFIRM_TOKEN) return { ok: false, reason: `confirm skal vaere "${HARNESS_CONFIRM_TOKEN}"` }

  const prodUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  if (prodUrl && url === prodUrl) return { ok: false, reason: 'supabaseUrl er identisk med production URL' }

  const ref = refOf(url)
  const prod = productionRefs(env)
  if (ref && prod.has(ref)) return { ok: false, reason: `supabaseUrl-ref (${ref}) er en KENDT production-ref — hard-blocked` }

  return { ok: true, url }
}

function assertSafety(secrets: HarnessSecrets, env: Record<string, string | undefined>): string {
  const e = evaluateHarnessTarget(secrets, env)
  if (!e.ok) {
    throw new Error(`Test Harness BLOKERET af safeguard: ${e.reason}. Harness maa ALDRIG koere mod production.`)
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

export function assertRuntimeConfig(
  secrets: HarnessSecrets = loadHarnessSecrets(),
  env: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const url = assertSafety(secrets, env)
  const anonKey = (secrets.anonKey || '').trim()
  const serviceKey = (secrets.serviceRoleKey || '').trim()
  if (!anonKey) throw new Error('Test Harness runtime: anonKey ikke sat')
  if (!serviceKey) throw new Error('Test Harness runtime: serviceRoleKey ikke sat')
  if (env.SUPABASE_SERVICE_ROLE_KEY && serviceKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Test Harness runtime: serviceRoleKey er identisk med PRODUCTION service-role — afvist')
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

export function assertBootstrapConfig(
  secrets: HarnessSecrets = loadHarnessSecrets(),
  env: Record<string, string | undefined> = process.env,
): BootstrapConfig {
  const url = assertSafety(secrets, env)
  const serviceKey = (secrets.serviceRoleKey || '').trim()
  const accessToken = (secrets.managementAccessToken || '').trim()
  if (!serviceKey) throw new Error('Test Harness bootstrap: serviceRoleKey ikke sat')
  if (!accessToken) throw new Error('Test Harness bootstrap: managementAccessToken ikke sat')
  if (env.SUPABASE_ACCESS_TOKEN && accessToken === env.SUPABASE_ACCESS_TOKEN) {
    throw new Error('Test Harness bootstrap: managementAccessToken er identisk med PRODUCTION token — afvist')
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && serviceKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Test Harness bootstrap: serviceRoleKey er identisk med PRODUCTION service-role — afvist')
  }
  return { url, serviceKey, accessToken }
}
