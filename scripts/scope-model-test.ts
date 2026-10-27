/**
 * 00240: app-modellen (src/lib/auth/scope-model.ts) og SQL-udkastet (docs/runbooks/mp-00240-draft.sql) skal bruge de
 * SAMME regler — ingen DB. Kør: npx tsx scripts/scope-model-test.ts
 */
import { readFileSync } from 'fs'
import { CASE_PARTY_COLUMNS, OPEN_TASK_STATUSES, WORK_ORDER_EXCLUDED_STATUS, CUSTOMER_SCOPE_KEYS, CASE_SCOPE_KEYS, scopeLevel, casePartyOrFilter } from '../src/lib/auth/scope-model'
import { PERMISSIONS, type Permission } from '../src/lib/auth/permissions'
import { computeEffectivePermissions } from '../src/lib/auth/effective-permissions'
import { PERMISSION_TEMPLATES, templateOverrides } from '../src/lib/auth/permission-templates'

let fails = 0
const t = (name: string, ok: boolean, note = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`) }
const sql = readFileSync('docs/runbooks/mp-00240-draft.sql', 'utf8')
const cust = sql.slice(sql.indexOf('FUNCTION public.my_customer_scope_ids'), sql.indexOf('REVOKE ALL ON FUNCTION public.my_case_scope_ids'))
const cases = sql.slice(sql.indexOf('FUNCTION public.my_case_scope_ids'), sql.indexOf('FUNCTION public.my_customer_scope_ids'))

t('SQL: alle 6 sagsparts-kolonner i kunde-hjælperen', CASE_PARTY_COLUMNS.every((c) => cust.includes(`s.${c}`)))
t('SQL: åbne opgavestatusser = app', cust.includes(`t.status IN (${OPEN_TASK_STATUSES.map((s) => `'${s}'`).join(', ')})`))
t('SQL: annullerede arbejdsordrer udelukkes i begge hjælpere', cust.includes(`w.status <> '${WORK_ORDER_EXCLUDED_STATUS}'`) && cases.includes(`w.status <> '${WORK_ORDER_EXCLUDED_STATUS}'`))
t('SQL: D4 via source_offer_id → offers.created_by', cases.includes('o.id = s.source_offer_id') && cases.includes('o.created_by = auth.uid()'))
t('SQL: nøgler = app-nøgler', [CUSTOMER_SCOPE_KEYS.all, CUSTOMER_SCOPE_KEYS.base, CASE_SCOPE_KEYS.all, CASE_SCOPE_KEYS.base].every((k) => sql.includes(`'${k}'`)))
const defaults = [...sql.matchAll(/\('([a-zæø]+)', 'customers\.view\.all'\)/g)].map((m) => m[1]).sort()
t('SQL: rollestandarder for customers.view.all = permissions.ts', defaults.join(',') === [...PERMISSIONS['customers.view.all']].sort().join(','), defaults.join(','))
t('SQL: ingen rolle-navne i politikkerne (kun effektive rettigheder)', !/user_role\(\)|profiles\.role/.test(sql.slice(sql.indexOf('CREATE POLICY'), sql.indexOf('-- 4.'))))
t('SQL: hjælpere REVOKE PUBLIC/anon + GRANT authenticated', /REVOKE ALL ON FUNCTION public\.my_case_scope_ids\(\) FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.my_customer_scope_ids\(\) TO authenticated/.test(sql))
t('SQL: rollback rører ikke anon', !/TO anon|FROM anon/.test(sql.slice(sql.indexOf('-- ROLLBACK'))))
t('casePartyOrFilter dækker 6 kolonner', casePartyOrFilter('x').split(',').length === 6)

// niveau pr. persona (effektive rettigheder)
const lvl = (perms: ReadonlySet<Permission>) => `${scopeLevel((p) => perms.has(p), CUSTOMER_SCOPE_KEYS)}/${scopeLevel((p) => perms.has(p), CASE_SCOPE_KEYS)}`
const want: Record<string, string> = { admin: 'all/all', serviceleder: 'all/all', bogholderi: 'all/all', salg: 'all/own_related', 'montør': 'own_related/own_related' }
for (const [r, w] of Object.entries(want)) t(`niveau ${r} = ${w}`, lvl(computeEffectivePermissions(r)) === w, lvl(computeEffectivePermissions(r)))
t('niveau Elektriker = own_related/own_related', lvl(computeEffectivePermissions('montør', templateOverrides(PERMISSION_TEMPLATES.elektriker))) === 'own_related/own_related')
t('niveau Overmontør = all/all', lvl(computeEffectivePermissions('montør', templateOverrides(PERMISSION_TEMPLATES.overmontor))) === 'all/all')
t('niveau inaktiv/manglende (ingen_adgang) = none/none', lvl(computeEffectivePermissions('ingen_adgang', templateOverrides(PERMISSION_TEMPLATES.overmontor))) === 'none/none')

console.log(fails ? `\n❌ ${fails} fejl` : '\n✅ scope-model = SQL-udkast')
process.exit(fails ? 1 : 0)
