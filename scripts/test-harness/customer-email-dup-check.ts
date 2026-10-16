/**
 * T-5 (review 2026-10-16) på staging: server-side dublet-værn på kunders e-mail (insertCustomerWithRetry).
 *   D1  ny kunde med ny mail oprettes; mailen gemmes normaliseret (trim + små bogstaver)
 *   D2  samme mail med andre bogstaver/mellemrum → DUPLICATE_EMAIL, intet insert, dansk besked med kundenr.
 *   D3  eksplicit override (allowDuplicateEmail) → oprettes
 *   D4  pladsholder-mail (auto+…@elta-crm.local) og tom streng tæller aldrig som dublet
 *   D5  race: 8 samtidige oprettelser med samme nye mail → præcis ÉN kunde overlever
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DupCheck { id: string; ok: boolean; note: string }

export async function runCustomerEmailDupCheck(c: { admin: SupabaseClient }): Promise<DupCheck[]> {
  const out: DupCheck[] = []
  const { insertCustomerWithRetry } = await import('../../src/lib/customers/customer-number')
  const admin = c.admin
  const stamp = Date.now()
  const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const made: string[] = []
  const mk = (email: string, allow = false) => insertCustomerWithRetry<{ id: string; email: string }>(admin, (no) => ({
    customer_number: no, company_name: `[HARNESS] dublet ${stamp}`, contact_person: 'D', email, created_by: owner,
  }), { label: 'harness-dup', selectClause: 'id, email', allowDuplicateEmail: allow })
  const base = `hdup-${stamp}@harness.test`
  try {
    const r1 = await mk(`  HDUP-${stamp}@Harness.TEST `)
    if (r1.data?.id) made.push(r1.data.id)
    out.push({ id: 'D1 ny mail oprettes og gemmes normaliseret', ok: !!r1.data?.id && r1.data.email === base, note: `email=${r1.data?.email ?? r1.error?.message}` })

    const r2 = await mk(`hdup-${stamp}@HARNESS.test`)
    if (r2.data?.id) made.push(r2.data.id)
    out.push({ id: 'D2 samme mail (andre bogstaver) → DUPLICATE_EMAIL uden insert', ok: !r2.data && r2.error?.code === 'DUPLICATE_EMAIL' && /Der findes allerede en kunde med e-mailen/.test(r2.error?.message ?? '') && /C\d+/.test(r2.error?.message ?? ''),
      note: `${r2.error?.code ?? 'oprettet!'} · ${r2.error?.message?.slice(0, 90) ?? ''}` })

    const r3 = await mk(base, true)
    if (r3.data?.id) made.push(r3.data.id)
    out.push({ id: 'D3 eksplicit "Opret alligevel" → oprettes', ok: !!r3.data?.id, note: r3.data?.id ? 'oprettet' : (r3.error?.message ?? '?') })

    const ph = `auto+hdup${stamp}@elta-crm.local`
    const p1 = await mk(ph); if (p1.data?.id) made.push(p1.data.id)
    const p2 = await mk(ph); if (p2.data?.id) made.push(p2.data.id)
    const e1 = await mk(''); if (e1.data?.id) made.push(e1.data.id)
    const e2 = await mk(''); if (e2.data?.id) made.push(e2.data.id)
    out.push({ id: 'D4 pladsholder og tom mail tæller ikke som dublet', ok: !!p1.data?.id && !!p2.data?.id && !!e1.data?.id && !!e2.data?.id,
      note: `pladsholder=${[p1, p2].filter((x) => x.data).length}/2 tom=${[e1, e2].filter((x) => x.data).length}/2` })

    const raceMail = `hdup-race-${stamp}@harness.test`
    const results = await Promise.all(Array.from({ length: 8 }, () => mk(raceMail)))
    for (const r of results) if (r.data?.id) made.push(r.data.id)
    const { data: survivors } = await admin.from('customers').select('id').ilike('email', raceMail)
    const n = (survivors ?? []).length
    for (const s of survivors ?? []) if (!made.includes((s as { id: string }).id)) made.push((s as { id: string }).id)
    out.push({ id: 'D5 8 samtidige oprettelser med samme mail → præcis én kunde', ok: n === 1,
      note: `overlevende=${n} · ok=${results.filter((r) => r.data).length} dublet=${results.filter((r) => r.error?.code === 'DUPLICATE_EMAIL').length}` })
  } catch (err) {
    out.push({ id: 'SEED', ok: false, note: err instanceof Error ? err.message : String(err) })
  } finally {
    if (made.length) await admin.from('customers').delete().in('id', made)
    await admin.from('customers').delete().like('company_name', `[HARNESS] dublet ${stamp}`)
  }
  return out
}

export function formatCustomerEmailDupCheck(checks: DupCheck[]): string {
  const passed = checks.filter((c) => c.ok).length
  return `${checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`).join('\n')}\n\n${passed}/${checks.length} ${passed === checks.length ? '✅' : '❌'}`
}
