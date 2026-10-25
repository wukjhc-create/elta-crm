/**
 * SEC-1/2/3/6 (permission-review 2026-10-16): hjælpere der bruger admin-klienten uden eget login-tjek (eller skriver
 * audit/alarmer for vilkårlige entiteter) må ALDRIG være server actions og ALDRIG importeres i klientkode.
 * Før var de 'use server'-eksporter → kaldbare udefra (fx route-preview returnerede kundemails uden login).
 *
 * Tjekker:
 *   1. modulerne har ikke 'use server'-direktivet;
 *   2. ingen 'use client'-fil importerer dem;
 *   3. SEC-4/SEC-5-værnene findes stadig (budget/lav-DB-strip på kundens sagsliste; sags-scope på kundedokumenter).
 *
 * Kør: npx tsx scripts/assert-server-only-helpers.ts (del af check:rbac)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SERVER_ONLY_MODULES = [
  'src/lib/actions/service-case-route-preview.ts',
  'src/lib/actions/mail-route-resolvers.ts',
  'src/lib/actions/system-alerts-admin.ts',
  'src/lib/audit/audit-log-writer.ts',
]

let failures = 0
const fail = (msg: string) => { failures++; console.log(`FAIL  ${msg}`) }
const pass = (msg: string) => console.log(`PASS  ${msg}`)

function hasDirective(src: string, directive: string): boolean {
  // direktivet står før første import/kode (kommentarer tilladt foran)
  const stripped = src.replace(/^﻿/, '').replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '')
  return stripped.startsWith(`'${directive}'`) || stripped.startsWith(`"${directive}"`)
}

for (const m of SERVER_ONLY_MODULES) {
  const src = readFileSync(join(ROOT, m), 'utf8')
  if (hasDirective(src, 'use server')) fail(`${m} er en 'use server'-fil (skal være almindeligt server-modul)`)
  else pass(`${m} er ikke 'use server'`)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const specifiers = SERVER_ONLY_MODULES.map((m) => '@/' + m.replace(/^src\//, '').replace(/\.ts$/, ''))
let clientHits = 0
for (const file of walk(join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8')
  if (!hasDirective(src, 'use client')) continue
  for (const spec of specifiers) {
    if (src.includes(`'${spec}'`) || src.includes(`"${spec}"`)) {
      clientHits++
      fail(`${relative(ROOT, file)} ('use client') importerer ${spec}`)
    }
  }
}
if (clientHits === 0) pass('ingen klientfil importerer server-only-hjælperne')

// gamle import-stier til audit-skrivning må ikke komme tilbage
const auditActions = readFileSync(join(ROOT, 'src/lib/actions/audit.ts'), 'utf8')
if (/export async function (createAuditLog|logCreate|logUpdate|logDelete|logStatusChange)\b/.test(auditActions)) {
  fail("src/lib/actions/audit.ts eksporterer igen audit-SKRIVNING som server action")
} else pass('audit.ts eksporterer kun læsning')

const cases = readFileSync(join(ROOT, 'src/lib/actions/service-cases.ts'), 'utf8')
const fnStart = cases.indexOf('export async function getCustomerServiceCasesResult')
const fnBody = fnStart >= 0 ? cases.slice(fnStart, cases.indexOf('\nexport ', fnStart + 10)) : ''
if (!fnBody.includes("hasPermission('economy.cost_prices')") || !fnBody.includes('budget: null')) {
  fail('SEC-4: getCustomerServiceCasesResult skjuler ikke budget/lav-DB uden economy.cost_prices')
} else pass('SEC-4: kundens sagsliste skjuler budget/lav-DB')

const docs = readFileSync(join(ROOT, 'src/lib/actions/customer-documents.ts'), 'utf8')
const dStart = docs.indexOf('export async function getCustomerDocuments')
const dBody = dStart >= 0 ? docs.slice(dStart, docs.indexOf('\nexport ', dStart + 10)) : ''
if (!dBody.includes("hasPermission('cases.view.all')") || !dBody.includes('getCaseScope')) {
  fail('SEC-5: getCustomerDocuments begrænser ikke sagsdokumenter til brugerens scope')
} else pass('SEC-5: kundedokumenter følger sags-scope')

// PERM-1 (Henrik 2026-10-25): rettigheder skal gå gennem det effektive sæt (rolle + overrides). Direkte rolle-tjek
// omgår overrides — ratchet: antallet må kun falde (sænk baseline, når kald konverteres).
{
  const RAW_HAS_BASELINE = 70
  const ROLE_CMP_BASELINE = 58
  const files = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.replace(/\\/g, '/').endsWith('src/lib/auth/permissions.ts'))
  let rawHas = 0, roleCmp = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    rawHas += (src.match(/hasPermission\(\s*[A-Za-z_.]*[rR]ole\b/g) ?? []).length
    roleCmp += (src.match(/\b[A-Za-z_.]*[rR]ole\s*[!=]==\s*'(admin|serviceleder|montør|salg|bogholderi)'/g) ?? []).length
  }
  if (rawHas > RAW_HAS_BASELINE) fail(`PERM-1: ${rawHas} direkte hasPermission(role, …) (baseline ${RAW_HAS_BASELINE}) — brug ctx.hasPermission / pageHasPermission`)
  else pass(`PERM-1: direkte hasPermission(role, …) = ${rawHas} (≤ ${RAW_HAS_BASELINE})`)
  if (roleCmp > ROLE_CMP_BASELINE) fail(`PERM-1: ${roleCmp} rolle-sammenligninger (baseline ${ROLE_CMP_BASELINE}) — brug en rettighed`)
  else pass(`PERM-1: rolle-sammenligninger = ${roleCmp} (≤ ${ROLE_CMP_BASELINE})`)
}

if (failures > 0) {
  console.log(`\n❌ ${failures} fejl`)
  process.exit(1)
}
console.log('\n✅ server-only-hjælpere OK')
