/**
 * Sikkerheds-flag-rapport. Indlaeser env PRAECIS som Next.js (@next/env) i
 * baade dev- og production-mode og rapporterer KUN ON/OFF — aldrig vaerdier.
 *   npm run safety:flags
 * Exit 1 hvis et flag er ON (fail-closed). Aendrer intet.
 * Scope: lokale .env*-filer + proces-miljoe. Vercel-miljoet kontrolleres IKKE her.
 */
import { loadEnvConfig } from '@next/env'

// Flag der SKAL vaere OFF. ON = vaerdien er praecis 'true' (samme semantik som appen).
const MUST_BE_OFF = ['AUTO_CREATE_CASES_ENABLED'] as const

let anyOn = false
for (const mode of ['development', 'production'] as const) {
  // forceReload nulstiller process.env til udgangspunktet foer hver indlaesning
  loadEnvConfig(process.cwd(), mode === 'development', { info: () => {}, error: () => {} }, true)
  for (const flag of MUST_BE_OFF) {
    const on = process.env[flag] === 'true'
    if (on) anyOn = true
    console.log(`${flag}: ${on ? 'ON' : 'OFF'}  (${mode}-env)`)
  }
}
process.exit(anyOn ? 1 : 0)
