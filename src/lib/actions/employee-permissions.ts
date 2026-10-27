'use server'

/**
 * PERM-1 fase 2 (Henrik 2026-10-26): Team → Medarbejder → Rettigheder. KUN users.manage_roles (admin).
 * Overrides skrives med admin-klienten (00238: ingen REST-skrivning for authenticated) og ALLE ændringer auditeres.
 * Værn: ingen ændrer sine egne rettigheder; den sidste aktive admin kan ikke miste admin-rollen via en skabelon.
 * SIKKERHED: en REVOKE håndhæves af server-actions/sider/scope — ikke af RLS ved direkte REST før tabellens policies er
 * konverteret (fase 4). UI'et siger det eksplicit.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, permissionDenied } from '@/lib/actions/action-helpers'
import { PERMISSIONS, type Permission } from '@/lib/auth/permissions'
import { computeEffectivePermissions, explainPermission, rolePermissions, type PermissionOverride, type PermissionSource } from '@/lib/auth/effective-permissions'
import { PERMISSION_TEMPLATES, templateOverrides, type TemplateKey } from '@/lib/auth/permission-templates'
import { PERMISSION_GROUP_LABELS, permissionGroup, type PermissionGroupKey } from '@/lib/auth/permission-groups'
import { permissionLabel } from '@/lib/auth/permission-text'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface EmployeePermissionRow {
  permission: Permission
  label: string
  effective: boolean
  source: PermissionSource
  /** override-detaljer (hvis afvigelse) */
  override?: { effect: 'grant' | 'revoke'; source: 'template' | 'manual'; reason: string | null; created_at: string }
}
export interface EmployeePermissionsView {
  profileId: string
  role: string
  template: TemplateKey | null
  templates: Array<{ key: TemplateKey; label: string; baseRole: string }>
  groups: Array<{ key: PermissionGroupKey; label: string; deviations: number; rows: EmployeePermissionRow[] }>
  effectiveCount: number
  overridesAvailable: boolean
}

type Result<T> = { ok: true; data: T } | { ok: false; message: string }

async function gate(employeeId: string): Promise<{ ok: true; userId: string; profileId: string; admin: AdminClient } | { ok: false; message: string }> {
  validateUUID(employeeId, 'medarbejder-ID')
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('users.manage_roles')) return { ok: false, message: 'Manglende tilladelse: users.manage_roles' }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: emp, error } = await admin.from('employees').select('profile_id').eq('id', employeeId).maybeSingle()
  if (error) return { ok: false, message: 'Kunne ikke læse medarbejderen' }
  const profileId = (emp as { profile_id?: string | null } | null)?.profile_id
  if (!profileId) return { ok: false, message: 'Medarbejderen har intet login' }
  return { ok: true, userId: ctx.userId, profileId, admin }
}

async function loadState(admin: AdminClient, profileId: string) {
  const { data: prof, error: pErr } = await admin.from('profiles').select('role, permission_template, full_name').eq('id', profileId).maybeSingle()
  if (pErr || !prof) throw new Error('Kunne ikke læse brugerens profil')
  const { data: rows, error } = await admin.from('user_permission_overrides').select('permission, effect, source, reason, created_at').eq('profile_id', profileId)
  const available = !error || !['42P01', 'PGRST205'].includes(error.code ?? '')
  if (error && available) throw new Error('Kunne ikke læse brugerens rettigheder')
  return {
    role: String((prof as { role: string }).role),
    template: ((prof as { permission_template?: string | null }).permission_template ?? null) as TemplateKey | null,
    fullName: (prof as { full_name?: string | null }).full_name ?? null,
    overrides: (error ? [] : (rows ?? [])) as Array<{ permission: Permission; effect: 'grant' | 'revoke'; source: 'template' | 'manual'; reason: string | null; created_at: string }>,
    available,
  }
}

export async function getEmployeePermissionsAction(employeeId: string): Promise<Result<EmployeePermissionsView>> {
  const denied = await permissionDenied('users.manage_roles')
  if (denied) return { ok: false, message: denied }
  try {
    const g = await gate(employeeId)
    if (!g.ok) return g
    const st = await loadState(g.admin, g.profileId)
    const ov: PermissionOverride[] = st.overrides.map((o) => ({ permission: o.permission, effect: o.effect }))
    const eff = computeEffectivePermissions(st.role, ov)
    const byKey = new Map(st.overrides.map((o) => [o.permission, o]))
    const groups = new Map<PermissionGroupKey, EmployeePermissionRow[]>()
    for (const k of Object.keys(PERMISSIONS) as Permission[]) {
      const gk = permissionGroup(k) ?? 'administration'
      const o = byKey.get(k)
      const row: EmployeePermissionRow = { permission: k, label: permissionLabel(k), effective: eff.has(k), source: explainPermission(st.role, ov, k),
        ...(o ? { override: { effect: o.effect, source: o.source, reason: o.reason, created_at: o.created_at } } : {}) }
      groups.set(gk, [...(groups.get(gk) ?? []), row])
    }
    return {
      ok: true,
      data: {
        profileId: g.profileId, role: st.role, template: st.template, effectiveCount: eff.size, overridesAvailable: st.available,
        templates: Object.values(PERMISSION_TEMPLATES).map((t) => ({ key: t.key, label: t.label, baseRole: t.baseRole })),
        groups: (Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroupKey[]).filter((k) => groups.has(k)).map((k) => ({
          key: k, label: PERMISSION_GROUP_LABELS[k], rows: groups.get(k)!, deviations: groups.get(k)!.filter((r) => r.override).length,
        })),
      },
    }
  } catch (e) {
    logger.error('getEmployeePermissionsAction failed', { error: e })
    return { ok: false, message: 'Kunne ikke hente rettighederne' }
  }
}

/** Tildel (grant), fratag (revoke) eller fjern afvigelsen (null) for én nøgle. Begrundelse kræves ved tildel/fratag. */
export async function setEmployeePermissionAction(employeeId: string, permission: string, effect: 'grant' | 'revoke' | null, reason: string | null): Promise<{ ok: boolean; message: string }> {
  const denied = await permissionDenied('users.manage_roles')
  if (denied) return { ok: false, message: denied }
  try {
    const g = await gate(employeeId)
    if (!g.ok) return g
    if (g.profileId === g.userId) return { ok: false, message: 'Du kan ikke ændre dine egne rettigheder' }
    if (!(permission in PERMISSIONS)) return { ok: false, message: 'Ukendt rettighed' }
    const st = await loadState(g.admin, g.profileId)
    if (!st.available) return { ok: false, message: 'Rettigheds-overrides er ikke aktiveret i dette miljø endnu' }
    const p = permission as Permission
    const prev = st.overrides.find((o) => o.permission === p) ?? null
    const roleHas = rolePermissions(st.role).has(p)
    if (effect === 'grant' && roleHas) return { ok: false, message: 'Rollen har allerede rettigheden — fjern i stedet en eventuel fratagelse' }
    if (effect === 'revoke' && !roleHas && !prev) return { ok: false, message: 'Rollen har ikke rettigheden' }
    const why = (reason ?? '').trim().slice(0, 500)
    if (effect && !why) return { ok: false, message: 'Skriv en kort begrundelse' }
    if (effect === null) {
      if (!prev) return { ok: false, message: 'Der er ingen afvigelse at fjerne' }
      const { error } = await g.admin.from('user_permission_overrides').delete().eq('profile_id', g.profileId).eq('permission', p)
      if (error) return { ok: false, message: 'Afvigelsen kunne ikke fjernes' }
    } else {
      const { error } = await g.admin.from('user_permission_overrides').upsert({
        profile_id: g.profileId, permission: p, effect, source: 'manual', reason: why, created_by: g.userId, updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id,permission' })
      if (error) return { ok: false, message: 'Rettigheden kunne ikke gemmes' }
    }
    await insertAuditRow({
      user_id: g.userId, entity_type: 'user', entity_id: g.profileId, entity_name: st.fullName,
      action: effect === null ? 'permission_override_removed' : 'permission_override_set',
      action_description: effect === null ? `Afvigelse fjernet: ${p}` : `${effect === 'grant' ? 'Tildelt' : 'Frataget'}: ${p}`,
      changes: { permission: p, old: prev ? { effect: prev.effect, source: prev.source } : null, new: effect ? { effect, source: 'manual' } : null, reason: why || null },
      metadata: { employee_id: employeeId },
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { ok: true, message: effect === null ? 'Afvigelsen er fjernet' : effect === 'grant' ? 'Rettigheden er tildelt' : 'Rettigheden er frataget' }
  } catch (e) {
    logger.error('setEmployeePermissionAction failed', { error: e })
    return { ok: false, message: 'Rettigheden kunne ikke gemmes' }
  }
}

/** Vælg skabelon: sætter basisrolle + skabelon og erstatter ALLE overrides med skabelonens (manuelle afvigelser fjernes). */
export async function applyEmployeePermissionTemplateAction(employeeId: string, templateKey: string): Promise<{ ok: boolean; message: string }> {
  const denied = await permissionDenied('users.manage_roles')
  if (denied) return { ok: false, message: denied }
  try {
    const g = await gate(employeeId)
    if (!g.ok) return g
    if (g.profileId === g.userId) return { ok: false, message: 'Du kan ikke ændre dine egne rettigheder' }
    const tpl = PERMISSION_TEMPLATES[templateKey as TemplateKey]
    if (!tpl) return { ok: false, message: 'Ukendt skabelon' }
    const st = await loadState(g.admin, g.profileId)
    if (!st.available) return { ok: false, message: 'Rettigheds-overrides er ikke aktiveret i dette miljø endnu' }
    // 00240: en skabelon kan bruge en nøgle der endnu ikke findes i miljøets katalog (fx customers.view.all før 00240) —
    // så afvises den FØR noget ændres (før: rolle skiftet + afvigelser slettet, derefter FK-fejl = halvt anvendt)
    const tplKeys = [...new Set(templateOverrides(tpl).map((o) => o.permission))]
    if (tplKeys.length) {
      const { data: cat, error: cErr } = await g.admin.from('permission_catalog').select('permission').in('permission', tplKeys)
      if (cErr) return { ok: false, message: 'Skabelonen kunne ikke anvendes' }
      const missing = tplKeys.filter((k) => !(cat ?? []).some((r: { permission: string }) => r.permission === k))
      if (missing.length) return { ok: false, message: `Skabelonen kræver en databaseopdatering, der ikke er kørt endnu (${missing.join(', ')}) — intet er ændret` }
    }
    const { lastAdminBlock, activeAdminCount } = await import('@/lib/auth/role-guard')
    const block = await lastAdminBlock(g.admin, g.profileId, { role: tpl.baseRole })
    if (block) return { ok: false, message: block }
    const { error: pErr } = await g.admin.from('profiles').update({ role: tpl.baseRole, permission_template: tpl.key, updated_at: new Date().toISOString() }).eq('id', g.profileId)
    if (pErr) return { ok: false, message: 'Skabelonen kunne ikke anvendes' }
    // TM-7-genkontrol efter skrivning: ingen aktiv admin tilbage → rul tilbage (kun muligt hvis brugeren var den sidste)
    if ((await activeAdminCount(g.admin)) === 0) {
      await g.admin.from('profiles').update({ role: 'admin', permission_template: st.template }).eq('id', g.profileId)
      return { ok: false, message: 'Den sidste aktive administrator kan ikke miste admin-rollen' }
    }
    const { error: dErr } = await g.admin.from('user_permission_overrides').delete().eq('profile_id', g.profileId)
    if (dErr) return { ok: false, message: 'Skabelonen kunne ikke anvendes (afvigelser blev ikke ryddet)' }
    const rows = templateOverrides(tpl).map((o) => ({ profile_id: g.profileId, permission: o.permission, effect: o.effect, source: 'template', reason: `Skabelon: ${tpl.label}`, created_by: g.userId }))
    if (rows.length) {
      const { error: iErr } = await g.admin.from('user_permission_overrides').insert(rows)
      if (iErr) return { ok: false, message: 'Skabelonens rettigheder kunne ikke gemmes — prøv igen' }
    }
    await insertAuditRow({
      user_id: g.userId, entity_type: 'user', entity_id: g.profileId, entity_name: st.fullName, action: 'permission_template_applied',
      action_description: `Skabelon "${tpl.label}" anvendt (rolle ${st.role} → ${tpl.baseRole})`,
      changes: { template: { old: st.template, new: tpl.key }, role: { old: st.role, new: tpl.baseRole }, removed_overrides: st.overrides.map((o) => ({ permission: o.permission, effect: o.effect, source: o.source })) },
      metadata: { employee_id: employeeId },
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { ok: true, message: `Skabelonen "${tpl.label}" er anvendt` }
  } catch (e) {
    logger.error('applyEmployeePermissionTemplateAction failed', { error: e })
    return { ok: false, message: 'Skabelonen kunne ikke anvendes' }
  }
}

/** Nulstil til skabelon: fjerner de manuelle afvigelser (skabelonens egne består). Uden skabelon: alle afvigelser. */
export async function resetEmployeePermissionsAction(employeeId: string): Promise<{ ok: boolean; message: string }> {
  const denied = await permissionDenied('users.manage_roles')
  if (denied) return { ok: false, message: denied }
  try {
    const g = await gate(employeeId)
    if (!g.ok) return g
    if (g.profileId === g.userId) return { ok: false, message: 'Du kan ikke ændre dine egne rettigheder' }
    const st = await loadState(g.admin, g.profileId)
    if (!st.available) return { ok: false, message: 'Rettigheds-overrides er ikke aktiveret i dette miljø endnu' }
    const removed = st.overrides.filter((o) => !st.template || o.source === 'manual')
    if (!removed.length) return { ok: true, message: 'Der er ingen afvigelser at nulstille' }
    let q = g.admin.from('user_permission_overrides').delete().eq('profile_id', g.profileId)
    if (st.template) q = q.eq('source', 'manual')
    const { error } = await q
    if (error) return { ok: false, message: 'Rettighederne kunne ikke nulstilles' }
    await insertAuditRow({
      user_id: g.userId, entity_type: 'user', entity_id: g.profileId, entity_name: st.fullName, action: 'permission_overrides_reset',
      action_description: st.template ? `Nulstillet til skabelonen "${PERMISSION_TEMPLATES[st.template]?.label ?? st.template}"` : 'Alle afvigelser fjernet (rollens standard)',
      changes: { removed: removed.map((o) => ({ permission: o.permission, effect: o.effect, source: o.source, reason: o.reason })) },
      metadata: { employee_id: employeeId },
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { ok: true, message: st.template ? 'Nulstillet til skabelonen' : 'Nulstillet til rollens standard' }
  } catch (e) {
    logger.error('resetEmployeePermissionsAction failed', { error: e })
    return { ok: false, message: 'Rettighederne kunne ikke nulstilles' }
  }
}
