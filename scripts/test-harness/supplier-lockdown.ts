/**
 * P-005 / 00164 + 00165 — verifikation paa staging med rigtige rolle-sessioner (pilot-personaer).
 *   K1  montoer kan IKKE laese api_credentials (jsonb, kan rumme klartekst), men kan laese de offentlige kolonner
 *   K2  montoer kan IKKE aendre standardmargin; admin kan (og aendringen rulles tilbage)
 *   K3  anon kan ikke laese supplier_settings
 *   K4  price_history accepterer change_source 'ftp_sync' (00165) — probe-raekke slettes
 *   K5  app-koden vaelger aldrig '*' / .select() mod supplier_settings (statisk)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface LockCheck { id: string; ok: boolean; note: string }

export async function runSupplierLockdown(c: { admin: SupabaseClient; anon: SupabaseClient; url: string; anonKey: string }): Promise<LockCheck[]> {
  const out: LockCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const { SUPPLIER_SETTINGS_PUBLIC_COLUMNS } = await import('../../src/lib/services/supplier-settings-columns')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const montor = personas.get('montør')!
  const adminUser = personas.get('admin')!
  // Probe-data (staging har ingen leverandoerindstillinger): dummy-vaerdi i api_credentials — IKKE en hemmelighed.
  const stamp = Date.now()
  const undo: Array<() => PromiseLike<unknown>> = []
  const seed = async (table: string, r: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([r]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    undo.unshift(() => c.admin.from(table).delete().eq('id', id))
    return id
  }
  try {
  const supplierId = await seed('suppliers', { name: `HARNESS-SEC lock ${stamp}`, code: `HSECL${stamp}` })
  const settingsId = await seed('supplier_settings', { supplier_id: supplierId, default_margin_percentage: 25, api_credentials: { probe: 'HARNESS-NOT-A-SECRET' } })
  await seed('supplier_products', { supplier_id: supplierId, supplier_sku: `HSEC-L-${stamp}`, supplier_name: 'HARNESS-SEC lock probe', cost_price: 1 })
  const row = { id: settingsId, default_margin_percentage: 25 }

  const secret = await montor.from('supplier_settings').select('api_credentials').eq('id', row.id)
  const pub = await montor.from('supplier_settings').select(SUPPLIER_SETTINGS_PUBLIC_COLUMNS).eq('id', row.id)
  out.push({ id: 'K1 montør: hemmelig nej / offentlig ja', ok: !!secret.error && !pub.error && (pub.data ?? []).length === 1,
    note: `hemmelig=${secret.error ? `afvist (${secret.error.message.slice(0, 40)})` : 'LÆST'} · offentlig=${pub.error ? `FEJL ${pub.error.message.slice(0, 40)}` : `${(pub.data ?? []).length} række`}` })

  const orig = row.default_margin_percentage
  const mUpd = await montor.from('supplier_settings').update({ default_margin_percentage: 99 }).eq('id', row.id).select('id')
  const afterM = (await c.admin.from('supplier_settings').select('default_margin_percentage').eq('id', row.id).single()).data as { default_margin_percentage: number }
  const aUpd = await adminUser.from('supplier_settings').update({ default_margin_percentage: orig }).eq('id', row.id).select('id')
  out.push({ id: 'K2 margin: montør nej / admin ja', ok: (!!mUpd.error || (mUpd.data ?? []).length === 0) && afterM.default_margin_percentage === orig && !aUpd.error && (aUpd.data ?? []).length === 1,
    note: `montør=${mUpd.error ? 'afvist' : `${(mUpd.data ?? []).length} rækker`} (margin uændret=${afterM.default_margin_percentage === orig}) · admin=${aUpd.error ? `FEJL ${aUpd.error.message.slice(0, 40)}` : 'opdaterede'}` })

  const an = await c.anon.from('supplier_settings').select('id').eq('id', row.id)
  out.push({ id: 'K3 anon kan ikke læse', ok: !!an.error || (an.data ?? []).length === 0, note: an.error ? `afvist (${an.error.message.slice(0, 40)})` : `${(an.data ?? []).length} rækker` })

  const sp = (await c.admin.from('supplier_products').select('id, cost_price').eq('supplier_id', supplierId).limit(1).maybeSingle()).data as { id: string; cost_price: number } | null
  if (sp) {
    const ins = await c.admin.from('price_history').insert([{ supplier_product_id: sp.id, old_cost_price: sp.cost_price, new_cost_price: sp.cost_price, change_percentage: 0, change_source: 'ftp_sync' }]).select('id')
    const id = (ins.data?.[0] as { id?: string } | undefined)?.id
    if (id) await c.admin.from('price_history').delete().eq('id', id)
    out.push({ id: 'K4 price_history ftp_sync (00165)', ok: !ins.error && !!id, note: ins.error ? `AFVIST: ${ins.error.message.slice(0, 60)}` : 'accepteret (probe slettet)' })
  } else out.push({ id: 'K4 price_history ftp_sync (00165)', ok: false, note: 'ingen supplier_products-række' })

  } finally {
    for (const u of undo) await u()
  }

  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(d, e.name)] : []))
  const bad: string[] = []
  for (const f of walk(join(process.cwd(), 'src'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/\.from\('supplier_settings'\)([\s\S]{0,400}?)(?=\.from\(|;|\n\s*\n)/g)) {
      if (/\.select\(\s*(['"]\*['"])?\s*\)/.test(m[1])) bad.push(f.slice(process.cwd().length + 1))
    }
  }
  out.push({ id: 'K5 ingen wildcard-select (statisk)', ok: bad.length === 0, note: bad.length ? bad.join(', ') : 'alle læsninger bruger SUPPLIER_SETTINGS_PUBLIC_COLUMNS' })
  return out
}

export function formatSupplierLockdown(c: LockCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'SUPPLIER_SETTINGS-LOCKDOWN (P-005, 00164/00165):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(40)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} checks som forventet`].join('\n')
}
