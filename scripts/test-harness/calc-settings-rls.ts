/**
 * 00223 (GP-1) på staging: indkøbsavancer i calculation_settings kun læsbare for kost-roller.
 *   C1  salg/montør kan IKKE læse margin_products; kan læse timepriser (hourly_rate_electrician)
 *   C2  admin/serviceleder/bogholderi kan læse margin_products
 *   C3  struktur: én SELECT-politik (ingen USING true tilbage)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CsCheck { id: string; ok: boolean; note: string }

export async function runCalcSettingsRls(c: { admin: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<CsCheck[]> {
  const out: CsCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  // Staging mangler måske nøglerne — seed midlertidigt (ryddes i finally)
  const seeded: string[] = []
  for (const [key, val, cat] of [['margin_products', { percentage: 20 }, 'margins'], ['hourly_rate_electrician', { rate: 495 }, 'hourly_rates']] as const) {
    const { data } = await c.admin.from('calculation_settings').select('id').eq('setting_key', key).maybeSingle()
    if (!data) {
      const ins = await c.admin.from('calculation_settings').insert({ setting_key: key, setting_value: val, category: cat, description: '[HARNESS] 00223' }).select('id').single()
      if (ins.data) seeded.push((ins.data as { id: string }).id)
    }
  }
  try {
  const read = async (cl: SupabaseClient, key: string) => ((await cl.from('calculation_settings').select('setting_key').eq('setting_key', key)).data ?? []).length
  const res: Record<string, { margin: number; rate: number }> = {}
  for (const [role, cl] of personas) res[role] = { margin: await read(cl, 'margin_products'), rate: await read(cl, 'hourly_rate_electrician') }
  const noCost = ['salg', 'montør'].filter((r) => res[r])
  const cost = ['admin', 'serviceleder', 'bogholderi'].filter((r) => res[r])
  out.push({ id: 'C1 salg/montør: ingen avance, men timepriser', ok: noCost.length > 0 && noCost.every((r) => res[r].margin === 0 && res[r].rate >= 1), note: noCost.map((r) => `${r} avance=${res[r].margin} sats=${res[r].rate}`).join(' · ') })
  out.push({ id: 'C2 kost-roller læser avancen', ok: cost.length > 0 && cost.every((r) => res[r].margin >= 1), note: cost.map((r) => `${r}=${res[r].margin}`).join(' · ') })
  const pol = await c.sql(`SELECT policyname, qual FROM pg_policies WHERE schemaname='public' AND tablename='calculation_settings' AND cmd='SELECT'`)
  out.push({ id: 'C3 én afgrænset SELECT-politik', ok: pol.length === 1 && !pol.some((p: any) => String(p.qual).trim() === 'true'), note: pol.map((p: any) => p.policyname).join(', ') })
  return out
  } finally {
    for (const id of seeded) await c.admin.from('calculation_settings').delete().eq('id', id)
  }
}

export function formatCalcSettingsRls(checks: CsCheck[]): string {
  const bad = checks.filter((c) => !c.ok).length
  return [...checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`), bad ? `❌ ${bad} fejl` : `✅ 00223 ${checks.length}/${checks.length}`].join('\n')
}
