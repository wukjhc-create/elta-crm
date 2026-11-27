/**
 * Parter fase B (00255) — rene + statiske tests (ingen DB).
 *   npx tsx scripts/party-phase-b-test.ts
 *
 * Dækker: dublet-normalisering (= 00255's SQL-funktioner; paritet bevises desuden mod staging i party-00255-probe),
 * feature-flag (standard FRA, kun 'true' tænder), INERT kode (hver handling returnerer "ikke aktiveret" før noget DB-kald;
 * panelerne renderes kun bag flaget), ingen direkte skrivning i partstabellerne (F-6/D-1), ingen admin-klient, F-1 urørt
 * (ingen feed-/offentliggørelses-kaldere, ingen portal-/reception-fil ændret i forhold til main).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { normalizePartyDomains, normalizePartyEmails, normalizePartyName, normalizePartyVat } from '../src/lib/parties/party-dedupe'
import { partiesUiEnabled, PARTIES_DISABLED_TEXT } from '../src/lib/parties/feature-flag'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
}

async function main() {
  // --- Normalisering / dublet-nøgler
  ok('navn: selskabsform + store bogstaver ignoreres', normalizePartyName('Solar Partner ApS') === 'solar partner' && normalizePartyName('SOLAR  partner a/s') === 'solar partner')
  ok('navn: danske bogstaver bevares (Æ→æ)', normalizePartyName('Ærø El I/S') === 'ærø el')
  ok('navn: "Atlas" mister ikke "as"', normalizePartyName('Atlas') === 'atlas')
  ok('navn: gentagne selskabsformer fjernes', normalizePartyName('Café Måne ApS ApS') === 'caf måne' || normalizePartyName('Café Måne ApS ApS') === 'café måne', String(normalizePartyName('Café Måne ApS ApS')))
  ok('navn: kun tegn → null', normalizePartyName('  —  ') === null && normalizePartyName('') === null)
  const em = normalizePartyEmails([' Info@Firma.DK ', 'info@firma.dk', '', 'x@elta-crm.local', 'ikke-en-mail'])
  ok('e-mails: små bogstaver, unikke; .local + ugyldige afvises', JSON.stringify(em.values) === '["info@firma.dk"]' && em.invalid.length === 2, JSON.stringify(em))
  const dm = normalizePartyDomains(['@Firma.dk', 'www.firma.dk', 'gmail.com', 'eltasolar.dk', 'ugyldig'])
  ok('domæner: @/www. fjernes; gmail.com/eget domæne er aldrig "verificeret domæne"; ugyldig afvises',
    JSON.stringify(dm.values) === '["firma.dk"]' && JSON.stringify(dm.freeMail) === '["gmail.com","eltasolar.dk"]' && dm.invalid.length === 1, JSON.stringify(dm))
  ok('CVR: DK-præfiks/mellemrum → cifre; tom → null; ugyldig → invalid',
    normalizePartyVat('DK 12 34 56 78') === '12345678' && normalizePartyVat('') === null && normalizePartyVat('12-34') === 'invalid' && normalizePartyVat('dk12345678') === '12345678')

  // --- Feature-flag: standard FRA
  const prev = process.env.PARTIES_UI_ENABLED
  for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes']) {
    if (v === undefined) delete process.env.PARTIES_UI_ENABLED; else process.env.PARTIES_UI_ENABLED = v
    ok(`flag FRA for ${JSON.stringify(v)}`, partiesUiEnabled() === false)
  }
  process.env.PARTIES_UI_ENABLED = 'true'
  ok('flag TIL kun for "true"', partiesUiEnabled() === true)
  if (prev === undefined) delete process.env.PARTIES_UI_ENABLED; else process.env.PARTIES_UI_ENABLED = prev

  // --- Inert: hver eksporteret handling tjekker flaget FØR noget andet (statisk + kørsel)
  const actions = read('src/lib/actions/parties.ts')
  const exported = [...actions.matchAll(/export async function (\w+)\s*\(/g)]
  ok('parties.ts har 11 handlinger', exported.length === 11, String(exported.length))
  for (let i = 0; i < exported.length; i++) {
    const body = actions.slice(exported[i].index!, i + 1 < exported.length ? exported[i + 1].index! : actions.length)
    const first = body.split('\n')[1] ?? '' // signaturen er altid én linje
    ok(`inert: ${exported[i][1]} starter med flag-tjek`, /^if \(!partiesUiEnabled\(\)\) return disabled\(\)$/.test(first.trim()), first)
  }
  delete process.env.PARTIES_UI_ENABLED
  try {
    const mod = await import('../src/lib/actions/parties')
    const id = '00000000-0000-4000-8000-000000000255'
    const results = await Promise.all([
      mod.getCustomerPartiesAction(id), mod.searchPartiesAction('abc'), mod.getCaseParticipantsAction(id),
      mod.createPartyAction({ kind: 'person', displayName: 'X' }), mod.updatePartyAction({ partyId: id, displayName: 'X' }),
      mod.ensureRegisterPartyAction('customer', id), mod.setPartyRelationshipAction(id, 'cooperation_partner'), mod.endPartyRelationshipAction(id, 'ended'),
      mod.addCaseParticipantAction(id, id, 'customer'), mod.addCaseParticipantFromRegisterAction(id, 'customer', id, 'customer'), mod.endCaseParticipantAction(id),
    ])
    ok('inert (kørsel): alle handlinger → "ikke aktiveret" uden login/DB med flaget FRA', results.every((r) => r.success === false && r.error === PARTIES_DISABLED_TEXT), JSON.stringify(results.map((r) => r.error)))
  } catch (e) {
    ok('inert (kørsel): handlingerne kan importeres og kaldes med flaget FRA', false, String(e).slice(0, 200))
  }

  // --- Ingen direkte skrivning i partstabellerne (F-6/D-1) og ingen admin-klient i fase B-koden
  const src = walk(resolve(process.cwd(), 'src'))
  const directWrites = src.filter((f) => /\.from\(\s*['"](parties|party_relationships|case_participants)['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(readFileSync(f, 'utf8').replace(/\s+/g, ' ')))
  ok('ingen .from(partstabel).insert/update/upsert/delete i src/', directWrites.length === 0, directWrites.join(', '))
  ok('ingen INSERT … RETURNING-mønster (.insert().select()) på partstabeller', !src.some((f) => /from\(['"](parties|party_relationships|case_participants)['"]\)[^;]*\.insert\([^;]*\.select\(/.test(readFileSync(f, 'utf8').replace(/\s+/g, ' '))))
  ok('parties.ts bruger ikke admin-/service-klienten', !/createAdminClient|service_role|SUPABASE_SERVICE/.test(actions))
  const rpcs = [...actions.matchAll(/\.rpc\('(\w+)'/g)].map((m) => m[1]).sort()
  ok('parties.ts kalder præcis de 8 00255-RPC\'er', JSON.stringify([...new Set(rpcs)]) === JSON.stringify(['add_case_participant', 'add_case_participant_for_register', 'create_party', 'end_case_participant', 'end_party_relationship', 'ensure_register_party', 'set_party_relationship', 'update_party']), JSON.stringify(rpcs))
  const rpcCallers = src.filter((f) => !f.endsWith(join('actions', 'parties.ts')) && /\.rpc\(\s*['"](create_party|update_party|ensure_register_party|set_party_relationship|end_party_relationship|add_case_participant|add_case_participant_for_register|end_case_participant)['"]/.test(readFileSync(f, 'utf8')))
  ok('ingen andre kaldere af fase B-RPC\'erne', rpcCallers.length === 0, rpcCallers.join(', '))

  // --- F-1 urørt: ingen feed-/offentliggørelses-kaldere; portal-/reception-filer uændret i forhold til main
  const feedCallers = src.filter((f) => !f.endsWith(join('parties', 'audience.ts')) && /readExternalFeed\(|['"]external_feed['"]|['"]publish_external['"]|['"]revoke_external_publication['"]/.test(readFileSync(f, 'utf8')))
  ok('F-1: ingen app-kalder af external_feed/publish_external/revoke (kun audience.ts definerer læseren)', feedCallers.length === 0, feedCallers.join(', '))
  ok('F-1: fase B-koden nævner ikke visible_in_portal/external_publications', !src.filter((f) => /parties|party/.test(f) && !f.endsWith('audience.ts')).some((f) => /visible_in_portal|external_publications/.test(readFileSync(f, 'utf8'))))
  let changed: string[] = []
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim()
    changed = execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean)
  } catch { changed = ['<git fejlede>'] }
  const PROTECTED = [/^src\/lib\/actions\/(portal|partner-portal|fuldmagt)\.ts$/, /^src\/app\/(portal|partner)\//, /^src\/app\/api\/(portal|partner)\//, /^src\/lib\/reception\//,
    /^src\/lib\/services\/email-/, /^src\/lib\/email\/supplier-senders\.ts$/, /^src\/lib\/parties\/audience\.ts$/, /customer-documents/, /^supabase\/migrations\/00254_/]
  // Phase C (Henrik 2026-11-27): C4-erstatningsflowet kræver ÉN vagt i email-intelligence (MAIL_CUSTOMER_AUTOCREATE_MODE).
  // Undtagelsen gælder kun den fil og kun hvis diffen udelukkende indfører den vagt — portal/partner/reception/dokumenter er
  // fortsat beskyttede (F-1).
  const PHASE_C_ALLOWED = 'src/lib/services/email-intelligence.ts'
  const phaseCDiffOk = (() => {
    if (!changed.includes(PHASE_C_ALLOWED)) return true
    try {
      const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim()
      const diff = execFileSync('git', ['diff', '-U0', base, '--', PHASE_C_ALLOWED], { encoding: 'utf8' })
      const lines = diff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
      return lines.length > 0 && lines.every((l) => l.startsWith('+') && /mailCustomerAutoCreateMode|AUTO-CREATE DISABLED|Phase C4|ukoblet og vises i arbejdskøen|uændret adfærd|return \{ customerId: null, created: false \}|^\+\s*\}?\s*$|^\+\s*\/\//.test(l))
    } catch { return false }
  })()
  const touched = changed.filter((f) => PROTECTED.some((re) => re.test(f)) && f !== PHASE_C_ALLOWED)
  ok('portal-/partner-/reception-/dokument-/00254-filer uændret i forhold til main', touched.length === 0, touched.join(', '))
  ok('Phase C: email-intelligence ændret KUN med C4-suggest-vagten (additiv, ingen fjernede linjer)', phaseCDiffOk)

  // --- UI bag flaget
  const cust = read('src/app/dashboard/customers/[id]/customer-detail-client.tsx')
  const order = read('src/app/dashboard/orders/[id]/order-detail-client.tsx')
  ok('kundekort: panelet renderes kun bag partiesEnabled (standard false)', /\{partiesEnabled && <CustomerPartiesPanel /.test(cust) && /partiesEnabled = false/.test(cust) && (cust.match(/<CustomerPartiesPanel/g) ?? []).length === 1)
  ok('sag/ordre: panelet renderes kun bag partiesEnabled (standard false)', /\{partiesEnabled && <CaseParticipantsPanel /.test(order) && (order.match(/partiesEnabled = false/g) ?? []).length === 2 && (order.match(/<CaseParticipantsPanel/g) ?? []).length === 1)
  ok('sider sender partiesUiEnabled() fra serveren', /partiesEnabled=\{partiesUiEnabled\(\)\}/.test(read('src/app/dashboard/customers/[id]/page.tsx')) && /partiesEnabled=\{partiesUiEnabled\(\)\}/.test(read('src/app/dashboard/orders/[id]/page.tsx')))
  const panelUsers = src.filter((f) => /<(CustomerPartiesPanel|CaseParticipantsPanel)\b/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')).sort()
  ok('panelerne bruges kun på kundekort og sag/ordre', JSON.stringify(panelUsers) === JSON.stringify(['src/app/dashboard/customers/[id]/customer-detail-client.tsx', 'src/app/dashboard/orders/[id]/order-detail-client.tsx']), JSON.stringify(panelUsers))

  // --- Migration 00255: ingen F-1-/portal-objekter i kroppen
  const mig = read('supabase/migrations/00255_party_write_rpcs.sql')
  const body = mig.slice(mig.indexOf('\nBEGIN;\n'), mig.indexOf('\nCOMMIT;\n')).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  ok('00255-kroppen rører ikke external_publications/external_feed/publish_external/visible_in_portal/customer_documents/conversations',
    !/external_publications|external_feed|publish_external|visible_in_portal|customer_documents|conversations/.test(body))
  ok('00255 lukker anon/authenticated/service_role på alle nye funktioner', /FROM PUBLIC, anon, authenticated, service_role;/.test(body))
  ok('00255 fjerner direkte skrivning (6 politikker + grants)', (body.match(/DROP POLICY \w+_(insert|update) ON/g) ?? []).length === 6 && /REVOKE INSERT, UPDATE, DELETE ON public\.parties, public\.party_relationships, public\.case_participants FROM authenticated/.test(body))
  const rbFile = read('docs/runbooks/sql/00255_rollback.sql')
  const rbMig = mig.slice(mig.indexOf('\n-- BEGIN;', mig.indexOf('-- ROLLBACK (manuel'))).split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n').trim()
  ok('docs/runbooks/sql/00255_rollback.sql = migrationens rollback-sektion', rbFile.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim() === rbMig)

  console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — parter fase B (rene/statiske)`)
  process.exitCode = fail ? 1 : 0
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
