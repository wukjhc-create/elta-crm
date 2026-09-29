/**
 * 00167 (suppliers.vat_number, IC10) + 00168 (suppliers admin-only skrivning, P-008) paa staging.
 * Probe-leverandoerer ryddes i finally.
 *
 *   V1  struktur: kolonne, CHECK, trigger, indeks, INGEN unik-constraint, funktioner med laast search_path
 *   V2  normalisering i DB = normalisering i TS (paritet over en tabel af input) + trigger normaliserer ved skriv
 *   V3  ugyldigt format afvises af CHECK
 *   V4  matcher: CVR i fakturatekst -> praecis den leverandoer (vat_match), selv med ukendt afsendernavn
 *   V5  matcher: to leverandoerer med samme CVR -> intet gaet (ambiguous_vat), ingen leverandoer valgt
 *   V6  eksisterende navne-match virker fortsat (uden CVR)
 *   V7  RLS (00168): ikke-admin personaer kan hverken oprette, aendre eller slette; admin kan; alle kan laese
 *   V8  anon: ingen adgang til suppliers
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface VatCheck { id: string; ok: boolean; note: string }

export async function runSupplierVat(c: { admin: SupabaseClient; anon: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<VatCheck[]> {
  const out: VatCheck[] = []
  const { normalizeVatNumber } = await import('../../src/lib/invoice-control/vat')
  const { matchSupplierInvoice } = await import('../../src/lib/services/incoming-invoice-matcher')
  const { parseSupplierInvoiceText } = await import('../../src/lib/services/incoming-invoice-parser')
  const { loginPersonas } = await import('./role-matrix')
  const stamp = Date.now()
  const d8 = (n: number) => String(10000000 + ((stamp + n) % 89999999)).slice(0, 8)
  const ids: string[] = []
  const seed = async (row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from('suppliers').insert([row]).select('id, vat_number')
    if (error || !data?.[0]) throw new Error(`seed suppliers: ${error?.message}`)
    ids.push((data[0] as { id: string }).id)
    return data[0] as { id: string; vat_number: string | null }
  }
  try {
    // V1 struktur
    const cols = await c.sql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='vat_number'`)
    const chk = await c.sql(`SELECT conname FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_vat_number_format'`)
    const trg = await c.sql(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND tgname='trg_suppliers_normalize_vat' AND tgenabled <> 'D'`)
    const idx = await c.sql(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='suppliers' AND indexdef ILIKE '%vat_number%'`)
    const fns = await c.sql(`SELECT proname, proconfig::text cfg FROM pg_proc WHERE proname IN ('normalize_vat_number','suppliers_normalize_vat')`)
    const unique = idx.some((i: any) => /UNIQUE/i.test(i.indexdef))
    const locked = fns.length === 2 && fns.every((f: any) => /search_path=/.test(f.cfg ?? ''))
    out.push({ id: 'V1 struktur', ok: cols.length === 1 && chk.length === 1 && trg.length === 1 && idx.length === 1 && !unique && locked,
      note: `kolonne=${cols.length} · check=${chk.length} · trigger=${trg.length} · indeks=${idx.length} (unik=${unique ? 'JA' : 'nej'}) · search_path låst=${locked}` })

    // V2 paritet DB <-> TS + trigger
    const inputs = ['12345678', '12 34 56 78', 'DK12345678', 'dk-12.34.56.78', '4512345678', ' SE556677889901 ', '', '   ', 'no12/345']
    const dbRows = await c.sql(`SELECT i, public.normalize_vat_number(i) n FROM unnest(ARRAY[${inputs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')}]) AS t(i)`)
    const mism = dbRows.filter((r: any) => (r.n ?? null) !== normalizeVatNumber(r.i))
    const s1 = await seed({ name: `HARNESS-VAT A ${stamp}`, code: `HVA${stamp}`, vat_number: `${d8(1).slice(0, 2)} ${d8(1).slice(2, 4)} ${d8(1).slice(4)}` })
    await c.admin.from('suppliers').update({ vat_number: `dk-${d8(2)}` }).eq('id', s1.id)
    const afterUpd = (await c.admin.from('suppliers').select('vat_number').eq('id', s1.id).single()).data as { vat_number: string }
    out.push({ id: 'V2 normalisering DB = TS + trigger', ok: mism.length === 0 && s1.vat_number === `DK${d8(1)}` && afterUpd.vat_number === `DK${d8(2)}`,
      note: `paritet ${dbRows.length - mism.length}/${dbRows.length}${mism.length ? ` AFVIGER: ${JSON.stringify(mism)}` : ''} · insert→${s1.vat_number === `DK${d8(1)}` ? 'DK+8' : s1.vat_number} · update→${afterUpd.vat_number === `DK${d8(2)}` ? 'DK+8' : afterUpd.vat_number}` })

    // V3 CHECK
    const bad = await c.admin.from('suppliers').insert([{ name: `HARNESS-VAT bad ${stamp}`, code: `HVX${stamp}`, vat_number: 'X' }]).select('id')
    if (bad.data?.[0]) ids.push((bad.data[0] as { id: string }).id)
    out.push({ id: 'V3 ugyldigt format afvises', ok: !!bad.error, note: bad.error ? `afvist (${bad.error.message.slice(0, 50)})` : 'ACCEPTERET' })

    // V4 matcher via CVR (ukendt afsendernavn)
    const text = `Faktura\nCVR: ${d8(2)}\nFakturanummer: HVAT-${stamp}\nBeløb i alt inkl. moms: 100,00`
    const parsed = parseSupplierInvoiceText(text)
    const base = { supplierName: `Ukendt Afsender ${stamp}`, invoiceNumber: null, workOrderHints: [], supplierOrderRefs: [], deliveryAddressHints: [], fileHash: `harness-vat-${stamp}` }
    const m1 = await matchSupplierInvoice({ ...base, supplierVatNumber: parsed.supplierVatNumber })
    out.push({ id: 'V4 CVR-match', ok: m1.supplierId === s1.id && m1.breakdown.reasons.some((r: string) => r.startsWith('vat_match:')),
      note: `parser-cvr=${parsed.supplierVatNumber === `DK${d8(2)}` ? 'DK+8' : parsed.supplierVatNumber} · leverandør=${m1.supplierId === s1.id ? 'korrekt' : m1.supplierId ?? 'ingen'} · ${m1.breakdown.reasons.join(',')}` })

    // V5 tvetydig CVR
    const s2 = await seed({ name: `HARNESS-VAT B ${stamp}`, code: `HVB${stamp}`, vat_number: d8(2) })
    const m2 = await matchSupplierInvoice({ ...base, supplierVatNumber: parsed.supplierVatNumber })
    out.push({ id: 'V5 samme CVR to steder: intet gæt', ok: s2.vat_number === `DK${d8(2)}` && m2.supplierId == null && m2.breakdown.reasons.some((r: string) => r.startsWith('ambiguous_vat:')),
      note: `leverandør=${m2.supplierId ?? 'ingen'} · ${m2.breakdown.reasons.join(',')}` })

    // V6 navne-match uaendret
    const s3 = await seed({ name: `HARNESS Navnematch ${stamp}`, code: `HVN${stamp}` })
    const m3 = await matchSupplierInvoice({ ...base, supplierName: `HARNESS Navnematch ${stamp}`, supplierVatNumber: null })
    out.push({ id: 'V6 navne-match virker fortsat', ok: m3.supplierId === s3.id, note: `${m3.breakdown.reasons.join(',')}` })

    // V7 RLS
    const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const nonAdmin = [...personas.entries()].filter(([k]) => k !== 'admin')
    const holes: string[] = []
    let readers = 0
    for (const [role, cl] of nonAdmin) {
      const r = await cl.from('suppliers').select('id').eq('id', s3.id)
      if (!r.error && (r.data ?? []).length === 1) readers++
      const i = await cl.from('suppliers').insert([{ name: `HARNESS-VAT ${role} ${stamp}`, code: `HVR${role.slice(0, 2)}${stamp}` }]).select('id')
      if (!i.error && (i.data ?? []).length) { holes.push(`${role}:insert`); ids.push((i.data![0] as { id: string }).id) }
      const u = await cl.from('suppliers').update({ notes: 'HARNESS hack' }).eq('id', s3.id).select('id')
      if (!u.error && (u.data ?? []).length) holes.push(`${role}:update`)
      const dl = await cl.from('suppliers').delete().eq('id', s3.id).select('id')
      if (!dl.error && (dl.data ?? []).length) holes.push(`${role}:delete`)
    }
    const still = (await c.admin.from('suppliers').select('id, notes').eq('id', s3.id).maybeSingle()).data as { id: string; notes: string | null } | null
    const adm = personas.get('admin')!
    const au = await adm.from('suppliers').update({ notes: `HARNESS admin ${stamp}` }).eq('id', s3.id).select('id')
    out.push({ id: 'V7 RLS: kun admin skriver', ok: nonAdmin.length > 0 && holes.length === 0 && !!still && still.notes !== 'HARNESS hack' && readers === nonAdmin.length && !au.error && (au.data ?? []).length === 1,
      note: `personaer=${nonAdmin.map(([k]) => k).join('/')} · huller=${holes.join(',') || 'ingen'} · læser=${readers}/${nonAdmin.length} · admin=${au.error ? `FEJL ${au.error.message.slice(0, 40)}` : 'opdaterede'}` })

    // V8 anon
    const an = await c.anon.from('suppliers').select('id').eq('id', s3.id)
    const anGrants = await c.sql(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='suppliers' AND grantee='anon'`)
    out.push({ id: 'V8 anon: ingen adgang', ok: (!!an.error || (an.data ?? []).length === 0) && anGrants[0].n === 0, note: `${an.error ? 'afvist' : `${(an.data ?? []).length} rækker`} · anon-grants=${anGrants[0].n}` })
  } finally {
    for (const id of ids) await c.admin.from('suppliers').delete().eq('id', id)
  }
  return out
}

export function formatSupplierVat(c: VatCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'LEVERANDØR-CVR (00167) + SKRIVELÅS (00168):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} checks som forventet`].join('\n')
}
