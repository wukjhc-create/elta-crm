/**
 * PERM-1 fase 1 — kompatibilitet og skabeloner (ren logik, ingen DB).
 *   npx tsx scripts/effective-permissions-test.ts
 * KRITISK: uden overrides SKAL effektive rettigheder = dagens rolle-rettigheder for alle roller × alle nøgler.
 */
import { PERMISSIONS, hasPermission, type Permission } from '../src/lib/auth/permissions'
import { computeEffectivePermissions, rolePermissions, explainPermission, NO_ACCESS_ROLE } from '../src/lib/auth/effective-permissions'
import { PERMISSION_TEMPLATES, SENSITIVE_PERMISSION_PATTERNS, templateOverrides } from '../src/lib/auth/permission-templates'
import { permissionGroup, SCOPE_SETS } from '../src/lib/auth/permission-groups'
import { permissionLabel } from '../src/lib/auth/permission-text'
import type { UserRole } from '../src/types/auth.types'

let bad = 0
const t = (label: string, ok: boolean, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const KEYS = Object.keys(PERMISSIONS) as Permission[]
const ROLES = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'] as const

// 1. kompatibilitet: uden overrides = hasPermission(role, …) for ALLE roller × nøgler
let mismatches = 0
for (const r of ROLES) {
  const eff = computeEffectivePermissions(r, [])
  for (const k of KEYS) if (eff.has(k) !== hasPermission(r as UserRole, k)) mismatches++
}
t(`uden overrides: effektiv = rolle for ${ROLES.length} roller × ${KEYS.length} nøgler`, mismatches === 0, `afvigelser=${mismatches}`)
t('ingen_adgang har ingen rettigheder', computeEffectivePermissions(NO_ACCESS_ROLE, []).size === 0)
t('ingen_adgang kan ikke få rettigheder via grant', computeEffectivePermissions(NO_ACCESS_ROLE, [{ permission: 'customers.view', effect: 'grant' }]).size === 0)
t('tom/ukendt rolle uden rettigheder', computeEffectivePermissions('', []).size === 0 && computeEffectivePermissions('ukendt', []).size === 0)

// 2. grant/revoke
const g = computeEffectivePermissions('montør', [{ permission: 'customers.create', effect: 'grant' }])
t('grant tilføjer nøgle', g.has('customers.create') && g.size === rolePermissions('montør').size + 1)
const rv = computeEffectivePermissions('montør', [{ permission: 'materials.view', effect: 'revoke' }])
t('revoke fjerner nøgle', !rv.has('materials.view') && rv.size === rolePermissions('montør').size - 1)
const both = computeEffectivePermissions('montør', [{ permission: 'customers.create', effect: 'grant' }, { permission: 'customers.create', effect: 'revoke' }])
t('revoke vinder over grant', !both.has('customers.create'))
t('ukendt nøgle i grant ignoreres', computeEffectivePermissions('montør', [{ permission: 'findes.ikke' as Permission, effect: 'grant' }]).size === rolePermissions('montør').size)

// 3. forklaring
const ov = [{ permission: 'customers.create' as Permission, effect: 'grant' as const }, { permission: 'materials.view' as Permission, effect: 'revoke' as const }]
t('explain: role/grant/revoke/none', explainPermission('montør', ov, 'customers.view') === 'role' && explainPermission('montør', ov, 'customers.create') === 'grant'
  && explainPermission('montør', ov, 'materials.view') === 'revoke' && explainPermission('montør', ov, 'bank.view') === 'none')

// 4. skabeloner
for (const tpl of Object.values(PERMISSION_TEMPLATES)) {
  const base = rolePermissions(tpl.baseRole)
  const eff = computeEffectivePermissions(tpl.baseRole, templateOverrides(tpl))
  const added = [...eff].filter((k) => !base.has(k))
  const sensitive = added.filter((k) => SENSITIVE_PERMISSION_PATTERNS.some((re) => re.test(k)))
  t(`skabelon ${tpl.label}: ingen følsomme nøgler ud over basisrollen`, sensitive.length === 0, sensitive.join(',') || `+${added.length}`)
  t(`skabelon ${tpl.label}: alle nøgler findes`, [...tpl.grants, ...tpl.revokes].every((k) => k in PERMISSIONS))
}
for (const k of ['salg', 'serviceleder', 'bogholderi'] as const) {
  const tpl = PERMISSION_TEMPLATES[k]
  t(`skabelon ${tpl.label} = præcis dagens rolle`, tpl.grants.length === 0 && tpl.revokes.length === 0 && tpl.baseRole === k)
}
t('Montør = præcis dagens montør', PERMISSION_TEMPLATES.montor.grants.length === 0 && PERMISSION_TEMPLATES.montor.revokes.length === 0)
const el = computeEffectivePermissions('montør', templateOverrides(PERMISSION_TEMPLATES.elektriker))
t('Elektriker = montør + customers.create + cases.create (ikke customers.edit)', el.has('customers.create') && el.has('cases.create') && el.has('cases.edit.own') && !el.has('customers.edit'))
const om = computeEffectivePermissions('montør', templateOverrides(PERMISSION_TEMPLATES.overmontor))
t('Overmontør ⊇ Elektriker', [...el].every((k) => om.has(k)))
t('Overmontør: alle sager/arbejdsordrer, planlægning, opgaver, timegodkendelse', ['cases.view.all', 'work_orders.view.all', 'calendar.view.all', 'calendar.plan', 'work_orders.plan', 'tasks.create', 'time_logs.approve'].every((k) => om.has(k as Permission)))
t('Overmontør: ingen løn/kost/regnskab/indstillinger', !['employees.payroll.view', 'economy.cost_prices', 'invoices.view.all', 'settings.view', 'materials.view.cost_prices', 'offers.view.cost_prices'].some((k) => om.has(k as Permission)))

// 5. grupper og scope-sæt
const ungrouped = KEYS.filter((k) => !permissionGroup(k))
t('alle nøgler har præcis én gruppe', ungrouped.length === 0, ungrouped.join(','))
const scopeKeys = SCOPE_SETS.flatMap((s) => s.levels.map((l) => l.key))
t('scope-sæt bruger kun eksisterende nøgler', scopeKeys.every((k) => k in PERMISSIONS))
t('ingen nøgle i to scope-sæt', new Set(scopeKeys).size === scopeKeys.length)

// 6. admin-UI'et viser danske etiketter (ingen engelske/tekniske ord) for alle nøgler
const englishLabels = KEYS.filter((k) => /\b(view|edit|own|all|add|case|mark|draft|cost|prices|payroll|credentials|manage)\b|_/.test(permissionLabel(k)))
t('alle nøgler har en dansk etiket', englishLabels.length === 0, englishLabels.join(','))

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ effektive rettigheder: kompatible og skabeloner ok')
process.exitCode = bad ? 1 : 0
