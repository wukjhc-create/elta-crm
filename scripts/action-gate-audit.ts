/**
 * Server-action gate-audit (P3 #17 / P-005). Statisk, ingen DB.
 *
 * Server actions ('use server') kan kaldes direkte af ENHVER indlogget bruger — et skjult menupunkt eller en
 * layout-guard beskytter ikke en action. To tjek:
 *
 *   (G) skrivende actions uden rettighedstjek i funktionskroppen (eller via en lokal require*-hjaelper der selv tjekker)
 *   (U) actions der bruger service-role (createAdminClient) uden NOGET login-/token-tjek, og som er eksponeret til
 *       klienten (refereret fra en 'use client'-fil — kun dem faar et action-id; Next fjerner resten)
 *
 *   npx tsx scripts/action-gate-audit.ts                   -> (G) for hele appen (rapport, exit 0)
 *   npx tsx scripts/action-gate-audit.ts --domain supplier -> (G) for pris-/leverandoerdomaenet (exit 2 ved fund)
 *   npx tsx scripts/action-gate-audit.ts --unauth          -> (U) (exit 2 ved eksponerede fund)
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { scanWriteSites, lastWriterClosure } from './rls-write-sites'

const GATE_RE = /requirePermission\(|hasPermission\(|requireAdmin\w*\(|requireSupplier[A-Za-z]*\(|requireRole\(|assertPermission\(|pageHasPermission\(/
// rpc('get_*'/'calculate_*') er rene laese-funktioner og taeller ikke som skrivning.
// Direkte DB-/storage-skrivning + kendte services der skriver paa actionens vegne (indirekte skrivning var et hul:
// backfillEmailAttachments skrev via processEmailAttachments uden gate).
const STATIC_INDIRECT_WRITERS = ['processEmailAttachments', 'ingestFromEmail', 'parseAndMatch', 'archiveAttachmentsToCustomerDocuments']
/**
 * P-009: ALLE funktioner uden for src/lib/actions og src/app der skriver til en tabel (AST-scan, scripts/rls-write-sites.ts)
 * taeller som indirekte skrivere — saa en action der kalder fx email-linker.manuallyLinkEmail uden gate fanges
 * automatisk (den haandholdte liste overså linkEmailToCustomer/unlinkEmailFromCustomer/ignoreIncomingEmail).
 */
function computeServiceWriters(): string[] {
  try {
    scanWriteSites()
    return lastWriterClosure.filter((n) => /^[A-Za-z_]\w{3,}$/.test(n) && !GENERIC_FN_NAMES.has(n))
  } catch {
    return []
  }
}
const GENERIC_FN_NAMES = new Set(['handler', 'POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'execute', 'main', 'default', 'modul'])
export const INDIRECT_WRITERS = [...new Set([...STATIC_INDIRECT_WRITERS, ...computeServiceWriters()])]
const WRITE_RE = new RegExp(String.raw`\.(insert|update|upsert|delete)\(|\.rpc\(\s*['"](?!get_|calculate_)|\.storage\s*\.from\([^)]*\)\s*\.(upload|remove|move)\(|\b(` + INDIRECT_WRITERS.join('|') + String.raw`)\(`)
const AUTH_RE = /gateDenied\(|requireGate\(|getAuthenticatedClient|getUser\(|auth\.getUser|requirePermission|require[A-Z]\w*\(|pageHasPermission|getUserRoleForPage|[Tt]oken|timingSafeEqual/
/** Bevidst offentlige actions (glemt-password begraenser selv sit svar). */
const INTENTIONALLY_PUBLIC = new Set(['requestPasswordReset'])

export const SUPPLIER_DOMAIN_FILES = ['suppliers.ts', 'import.ts', 'credentials.ts', 'lemu-sync.ts', 'customer-pricing.ts', 'kalkia-supplier-prices.ts',
  'margin-rules.ts', 'price-engine.ts', 'supplier-sync.ts', 'sync-schedules.ts', 'sync.ts', 'products.ts', 'materials.ts']

function walk(dir: string, re: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), re) : re.test(e.name) ? [join(dir, e.name)] : []))
}

function exportedFunctions(src: string): Array<{ name: string; body: string }> {
  const starts = [...src.matchAll(/export async function (\w+)\s*\(/g)]
  return starts.map((m, i) => ({ name: m[1], body: src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : src.length) }))
}

/** Lokale (ikke-eksporterede) hjaelpere hvis krop selv indeholder et rettighedstjek. */
function localGateHelpers(src: string): RegExp | null {
  const names: string[] = []
  // Krop-klammen er den der afslutter signatur-linjen (returtyper kan selv indeholde '{ ... }').
  for (const h of src.matchAll(/(?:async )?function (\w+)\s*\([^)]*\)[^\n]*\{\r?\n/g)) {
    if (/export\s+$/.test(src.slice(Math.max(0, h.index! - 20), h.index!))) continue
    const start = h.index! + h[0].length
    let depth = 1
    let k = start
    while (k < src.length && depth > 0) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++ }
    if (GATE_RE.test(src.slice(start, k))) names.push(h[1])
  }
  return names.length ? new RegExp(`\\b(${names.join('|')})\\(`) : null
}

export interface UngatedAction { file: string; fn: string }

export function runActionGateAudit(dir = join(process.cwd(), 'src', 'lib', 'actions')): { scanned: number; ungated: UngatedAction[] } {
  const ungated: UngatedAction[] = []
  let scanned = 0
  for (const path of walk(dir, /\.ts$/)) {
    const src = readFileSync(path, 'utf8')
    if (!/^\s*['"]use server['"]/.test(src)) continue
    const helpers = localGateHelpers(src)
    const file = path.slice(dir.length + 1).split('\\').join('/')
    for (const f of exportedFunctions(src)) {
      if (!WRITE_RE.test(f.body)) continue
      scanned++
      if (GATE_RE.test(f.body) || (helpers && helpers.test(f.body))) continue
      ungated.push({ file, fn: f.name })
    }
  }
  return { scanned, ungated }
}

let clientNameCache: Set<string> | null = null
/** Identifikatorer der forekommer i 'use client'-filer (kun de actions har et action-id i klient-bundlen). */
function clientReferencedNames(root: string): Set<string> {
  if (clientNameCache) return clientNameCache
  const names = new Set<string>()
  for (const path of walk(root, /\.(ts|tsx)$/)) {
    const src = readFileSync(path, 'utf8')
    if (!/^\s*['"]use client['"]/.test(src)) continue
    for (const m of src.matchAll(/\b([a-z][A-Za-z0-9]+)\b/g)) names.add(m[1])
  }
  return (clientNameCache = names)
}

/** Uden cache (til fixtures i tests). */
function freshClientNames(root: string): Set<string> {
  const names = new Set<string>()
  for (const path of walk(root, /\.(ts|tsx)$/)) {
    const src = readFileSync(path, 'utf8')
    if (!/^\s*['"]use client['"]/.test(src)) continue
    for (const m of src.matchAll(/\b([a-z][A-Za-z0-9]+)\b/g)) names.add(m[1])
  }
  return names
}

export interface UnauthAction { file: string; fn: string; writes: boolean; exposed: boolean; intentionallyPublic: boolean }

export function runUnauthenticatedAdminAudit(root = join(process.cwd(), 'src')): UnauthAction[] {
  const out: UnauthAction[] = []
  const clientNames = clientReferencedNames(root)
  for (const path of walk(root, /\.ts$/)) {
    const src = readFileSync(path, 'utf8')
    if (!/^\s*['"]use server['"]/.test(src)) continue
    for (const f of exportedFunctions(src)) {
      // P-009: ogsaa INDIREKTE skrivning (service-role inde i en service) uden login-tjek taeller.
      if (!(/createAdminClient\(/.test(f.body) || WRITE_RE.test(f.body)) || AUTH_RE.test(f.body)) continue
      out.push({ file: path.slice(root.length + 1).split('\\').join('/'), fn: f.name, writes: WRITE_RE.test(f.body),
        exposed: clientNames.has(f.name), intentionallyPublic: INTENTIONALLY_PUBLIC.has(f.name) })
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// STRICT (CI): hver skrivende action er enten gatet eller en BEVIST undtagelse (scripts/action-gate-exemptions.ts)
// ---------------------------------------------------------------------------------------------------------------
const TOKEN_PROOF = /validatePortalToken\(|validatePartnerToken\(|\.eq\(\s*['"]token['"]/
const SELF_PROOF = /\.eq\(\s*['"](id|to_user_id|user_id|profile_id)['"]\s*,\s*userId\s*\)|from_user_id:\s*userId/

export function runStrictAudit(
  dir = join(process.cwd(), 'src', 'lib', 'actions'),
  exemptions?: Record<string, { kind: 'server-only' | 'token' | 'self'; reason: string }>,
  clientRoot = join(process.cwd(), 'src'),
): { failures: string[]; gated: number; exempt: number; scanned: number } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ACTION_GATE_EXEMPTIONS = exemptions ?? (require('./action-gate-exemptions') as typeof import('./action-gate-exemptions')).ACTION_GATE_EXEMPTIONS
  const clientNames = exemptions ? freshClientNames(clientRoot) : clientReferencedNames(clientRoot)
  const failures: string[] = []
  const seen = new Set<string>()
  let scanned = 0
  let gated = 0
  let exempt = 0
  for (const path of walk(dir, /\.ts$/)) {
    const src = readFileSync(path, 'utf8')
    if (!/^\s*['"]use server['"]/.test(src)) continue
    const helpers = localGateHelpers(src)
    const file = path.slice(dir.length + 1).split('\\').join('/')
    for (const f of exportedFunctions(src)) {
      if (!WRITE_RE.test(f.body)) continue
      scanned++
      const key = `${file}:${f.name}`
      const isGated = GATE_RE.test(f.body) || (helpers !== null && helpers.test(f.body))
      const ex = ACTION_GATE_EXEMPTIONS[key]
      if (ex) seen.add(key)
      if (isGated) {
        gated++
        if (ex) failures.push(`${key}: undtaget men nu gatet — fjern undtagelsen (stale)`)
        continue
      }
      if (!ex) { failures.push(`${key}: skrivende action uden rettighedstjek og uden begrundet undtagelse`); continue }
      if (!ex.reason.trim()) failures.push(`${key}: undtagelse uden begrundelse`)
      if (ex.kind === 'server-only' && clientNames.has(f.name)) failures.push(`${key}: markeret server-only, men refereres fra klientkode`)
      if (ex.kind === 'token' && !TOKEN_PROOF.test(f.body)) failures.push(`${key}: markeret token, men validerer intet token`)
      if (ex.kind === 'self' && !SELF_PROOF.test(f.body)) failures.push(`${key}: markeret self, men er ikke bundet til den indloggede bruger`)
      exempt++
    }
  }
  for (const key of Object.keys(ACTION_GATE_EXEMPTIONS)) if (!seen.has(key)) failures.push(`${key}: undtagelse for en action der ikke (længere) findes/skriver — fjern den (stale)`)
  return { failures, gated, exempt, scanned }
}

if (process.argv[1] && /action-gate-audit/.test(process.argv[1]) && process.argv.includes('--strict')) {
  const r = runStrictAudit()
  console.log(`ACTION-GATE STRICT: ${r.scanned} skrivende actions · ${r.gated} gatet · ${r.exempt} bevist undtaget · ${r.failures.length} fejl`)
  for (const f of r.failures) console.log(`  ❌ ${f}`)
  if (!r.failures.length) console.log('  ✅ alle skrivende server-actions er gatet eller bevist undtaget')
  process.exitCode = r.failures.length ? 2 : 0
} else if (process.argv[1] && /action-gate-audit/.test(process.argv[1])) {
  if (process.argv.includes('--unauth')) {
    const u = runUnauthenticatedAdminAudit()
    const risky = u.filter((x) => x.exposed && !x.intentionallyPublic)
    console.log(`UNAUTH-ADMIN-AUDIT: ${u.length} service-role-actions uden login-tjek · ${risky.length} eksponeret til klienten (fejl)`)
    for (const x of u) console.log(`  ${x.intentionallyPublic ? 'OFFENTLIG  ' : x.exposed ? 'EKSPONERET ' : 'server-only'} ${x.writes ? 'skriv' : 'læs '} ${x.file}: ${x.fn}`)
    process.exitCode = risky.length ? 2 : 0
  } else {
    const domain = process.argv.includes('--domain') ? process.argv[process.argv.indexOf('--domain') + 1] : null
    const { scanned, ungated } = runActionGateAudit()
    const shown = domain === 'supplier' ? ungated.filter((u) => SUPPLIER_DOMAIN_FILES.includes(u.file)) : ungated
    const byFile = new Map<string, string[]>()
    for (const u of shown) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u.fn])
    console.log(`ACTION-GATE-AUDIT${domain ? ` (domæne: ${domain})` : ''}: ${scanned} skrivende actions scannet · ${shown.length} uden rettighedstjek`)
    if (process.argv.includes('--exposure')) {
      const clientNames = clientReferencedNames(join(process.cwd(), 'src'))
      for (const u of shown) console.log(`  ${clientNames.has(u.fn) ? 'KLIENT' : 'server'}  ${u.file}: ${u.fn}`)
    } else {
      for (const [f, fns] of [...byFile.entries()].sort()) console.log(`  ${f}: ${fns.join(', ')}`)
    }
    process.exitCode = domain && shown.length ? 2 : 0
  }
}
