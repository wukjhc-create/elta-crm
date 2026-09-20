/**
 * Test Harness — BOOTSTRAP (kun schema/migrationer).
 *
 * Bruger management access-token (assertBootstrapConfig) — UDELUKKENDE til at
 * oprette/anvende/verificere migrationer paa staging. Kaldes ALDRIG af
 * generator/scenario-runner/load-tests (de bruger runtime-config uden token).
 *
 * Efter schema er etableret+verificeret kan HARNESS_SUPABASE_ACCESS_TOKEN
 * fjernes igen — runtime-simulation behoever det ikke.
 */
import { assertBootstrapConfig, maskSecret } from './env-guard'

/** Diagnostics uden secrets (maskeret). */
export function bootstrapDiagnostics(env: Record<string, string | undefined> = process.env): string {
  const url = (env.HARNESS_SUPABASE_URL || '').trim()
  return [
    `HARNESS_SUPABASE_URL: ${url || '(unset)'}`,
    `HARNESS_SUPABASE_SERVICE_ROLE_KEY: ${maskSecret((env.HARNESS_SUPABASE_SERVICE_ROLE_KEY || '').trim() || undefined)}`,
    `HARNESS_SUPABASE_ACCESS_TOKEN: ${maskSecret((env.HARNESS_SUPABASE_ACCESS_TOKEN || '').trim() || undefined)}`,
  ].join('\n')
}

/**
 * Anvend migrationer paa staging. IKKE wired endnu — safeguard (bootstrap)
 * sikrer at det aldrig rammer production; wires naar staging findes.
 */
export async function applyMigrationsToStaging(): Promise<never> {
  const cfg = assertBootstrapConfig() // kaster hvis token/target ikke er sikkert staging
  void cfg
  throw new Error(
    'Test Harness bootstrap (migrationer) er endnu ikke wired. Bootstrap-config er ' +
      'valideret; anvend derefter 00000..00158 mod staging via Management API.',
  )
}
