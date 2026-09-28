/**
 * P3 #15 — opkalds-opslag paa staging med probe-data i blandede formater (som prod: 8 cifre m/u mellemrum, +45,
 * 0045). Ingen netvaerk. Probe-raekker slettes i finally.
 *   R1  nummer i 3 formater (kunde-telefon, kontakt-mobil, lead) -> 3 match
 *   R2  kundens aabne sag + aabne tilbud medtages; lukket sag/accepteret tilbud udelades
 *   R3  ukendt nummer -> 0 match; ugyldigt nummer -> number=null
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RelCheck { id: string; ok: boolean; note: string }

export async function runRelatelLookup(c: { admin: SupabaseClient; ownerUid: string }): Promise<RelCheck[]> {
  const { lookupCaller } = await import('../../src/lib/integrations/relatel/lookup')
  const out: RelCheck[] = []
  const stamp = Date.now()
  const local = `9${String(stamp).slice(-7)}` // 8 cifre, starter med 9 (usandsynligt i testdata)
  const spaced = `${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6)}`
  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  try {
    const custA = await ins('customers', { customer_number: `HARNESS-RL-A-${stamp}`, company_name: '[HARNESS] relatel A', contact_person: 'A', email: `rl-a-${stamp}@harness.test`, phone: spaced, created_by: c.ownerUid, custom_fields: { harness: 'relatel' } })
    const custB = await ins('customers', { customer_number: `HARNESS-RL-B-${stamp}`, company_name: '[HARNESS] relatel B', contact_person: 'B', email: `rl-b-${stamp}@harness.test`, created_by: c.ownerUid, custom_fields: { harness: 'relatel' } })
    await ins('customer_contacts', { customer_id: custB, name: '[HARNESS] kontakt', mobile: `+45${local}` })
    await ins('leads', { company_name: '[HARNESS] relatel lead', contact_person: 'L', email: `rl-l-${stamp}@harness.test`, phone: `0045 ${local}`, status: 'new', created_by: c.ownerUid, custom_fields: { harness: 'relatel' } })
    const openCase = await ins('service_cases', { title: '[HARNESS] relatel åben', status: 'new', customer_id: custA, is_proposal: false, created_by: c.ownerUid })
    await ins('service_cases', { title: '[HARNESS] relatel lukket', status: 'closed', customer_id: custA, is_proposal: false, created_by: c.ownerUid })
    const openOffer = await ins('offers', { offer_number: `HARNESS-RL-${stamp}`, title: '[HARNESS] relatel tilbud', status: 'sent', customer_id: custA, created_by: c.ownerUid, total_amount: 0, final_amount: 0 })
    await ins('offers', { offer_number: `HARNESS-RL-X-${stamp}`, title: '[HARNESS] relatel accepteret', status: 'accepted', customer_id: custA, created_by: c.ownerUid, total_amount: 0, final_amount: 0 })

    const r = await lookupCaller(c.admin, `45${local}`)
    const kinds = r.matches.map((m) => m.kind).sort().join(',')
    out.push({ id: 'R1 3 formater -> 3 match', ok: r.matches.length === 3 && kinds === 'contact,customer,lead', note: `match=${r.matches.length} (${kinds})` })
    out.push({ id: 'R2 åbne sager/tilbud', ok: r.openCases.some((x) => x.id === openCase) && r.openCases.every((x) => x.status !== 'closed')
      && r.openOffers.some((x) => x.id === openOffer) && r.openOffers.every((x) => x.status !== 'accepted'),
      note: `sager=${r.openCases.filter((x) => x.customer_id === custA).length} tilbud=${r.openOffers.filter((x) => x.customer_id === custA).length} (lukket/accepteret udeladt)` })
    const unknown = await lookupCaller(c.admin, '4500000001')
    const invalid = await lookupCaller(c.admin, '12')
    out.push({ id: 'R3 ukendt/ugyldigt nummer', ok: unknown.matches.length === 0 && invalid.number === null, note: `ukendt match=${unknown.matches.length} · ugyldigt number=${invalid.number}` })
  } finally {
    for (const x of created) await c.admin.from(x.table).delete().eq('id', x.id)
  }
  return out
}

export function formatRelatelLookup(c: RelCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'RELATEL OPKALDS-OPSLAG (ingen netværk):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(28)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} opslag-checks som forventet`].join('\n')
}
