/**
 * P-006 runde 3 — DYNAMISK bevis for token-undtagelserne (scripts/action-gate-exemptions.ts, kind 'token').
 * Hver kunde-action kaldes med malformet / ukendt / udloebet / inaktivt token og skal afvise UDEN dataaendring.
 * Positiv kontrol: sendPortalMessage med gyldigt token lykkes (ellers beviser afvisningerne intet).
 * Probe-tokens/-tilbud/-opgaver/-beskeder ryddes i finally. Ingen mail sendes (portal-actions sender ikke mail).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface ProofCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>

export async function runExemptionProofs(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<ProofCheck[]> {
  const out: ProofCheck[] = []
  const portal = await import('../../src/lib/actions/portal')
  const { submitConfirmation } = await import('../../src/lib/actions/document-confirmations')
  const { submitSignedFuldmagt } = await import('../../src/lib/actions/fuldmagt')
  const cust = (await c.sql(`SELECT id, email FROM customers WHERE custom_fields->>'harness' IS NOT NULL AND email IS NOT NULL LIMIT 1`))[0]
  if (!cust) return [{ id: 'setup', ok: false, note: 'ingen harness-kunde' }]
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  try {
    const validTok = randomBytes(32).toString('hex')
    const expiredTok = randomBytes(32).toString('hex')
    const inactiveTok = randomBytes(32).toString('hex')
    await ins('portal_access_tokens', { customer_id: cust.id, token: validTok, email: cust.email, is_active: true, expires_at: new Date(Date.now() + 86_400_000).toISOString(), created_by: c.ownerUid })
    await ins('portal_access_tokens', { customer_id: cust.id, token: expiredTok, email: cust.email, is_active: true, expires_at: new Date(Date.now() - 86_400_000).toISOString(), created_by: c.ownerUid })
    await ins('portal_access_tokens', { customer_id: cust.id, token: inactiveTok, email: cust.email, is_active: false, created_by: c.ownerUid })
    const offerId = await ins('offers', { offer_number: `HARNESS-EX-${stamp}`, title: '[HARNESS] undtagelsesbevis', status: 'sent', customer_id: cust.id, created_by: c.ownerUid, total_amount: 0, final_amount: 0 })
    const taskId = await ins('customer_tasks', { customer_id: cust.id, title: '[HARNESS] besigtigelse bevis', status: 'pending', priority: 'normal', created_by: c.ownerUid })

    const bad: Record<string, string> = { malformet: 'abc; drop table', ukendt: randomBytes(32).toString('hex'), udloebet: expiredTok, inaktiv: inactiveTok }
    const snapshot = async () => JSON.stringify({
      offer: (await c.sql(`SELECT status FROM offers WHERE id='${offerId}'`))[0]?.status,
      task: (await c.sql(`SELECT status, description FROM customer_tasks WHERE id='${taskId}'`))[0],
      msgs: Number((await c.sql(`SELECT count(*)::int n FROM portal_messages WHERE customer_id='${cust.id}' AND message LIKE '[HARNESS-EX]%'`))[0].n),
    })
    const before = await snapshot()
    type Call = (tok: string) => Promise<{ success?: boolean } | undefined>
    const calls: Record<string, Call> = {
      acceptOffer: (t) => portal.acceptOffer(t, { offer_id: offerId, signer_name: 'Probe', signer_email: 'probe@harness.test', signature_data: 'x' } as never),
      rejectOffer: (t) => portal.rejectOffer(t, offerId, 'probe'),
      sendPortalMessage: (t) => portal.sendPortalMessage(t, { message: `[HARNESS-EX] afvist ${stamp}` } as never),
      markPortalMessagesAsRead: (t) => portal.markPortalMessagesAsRead(t, []),
      portalConfirmBesigtigelse: (t) => portal.portalConfirmBesigtigelse(t, taskId),
      portalRequestReschedule: (t) => portal.portalRequestReschedule(t, taskId, 'probe'),
      submitSignedFuldmagt: (t) => submitSignedFuldmagt(t, taskId, { foedselsdato_cvr: '010101', marketing_samtykke: false, signature_data: 'x' } as never),
      submitConfirmation: (t) => submitConfirmation({ token: t, confirmerName: 'Probe' } as never),
    }
    for (const [name, call] of Object.entries(calls)) {
      const accepted: string[] = []
      for (const [label, tok] of Object.entries(bad)) {
        const r = await call(tok).catch(() => ({ success: false }))
        if (r && r.success) accepted.push(label)
      }
      out.push({ id: `T ${name}`, ok: accepted.length === 0, note: accepted.length ? `ACCEPTERET: ${accepted.join(', ')}` : 'afvist 4/4 ugyldige tokens' })
    }
    const after = await snapshot()
    out.push({ id: 'T ingen dataændring', ok: before === after, note: before === after ? 'tilbud, opgave og beskeder uændrede' : `ÆNDRET: ${before} -> ${after}` })

    // gyldigt token men ANDEN kundes id i payload -> afvist (cross-customer)
    const other = (await c.sql(`SELECT id FROM customers WHERE id <> '${cust.id}' LIMIT 1`))[0]
    const cross = await portal.sendPortalMessage(validTok, { customer_id: other?.id, message: `[HARNESS-EX] kryds ${stamp}` } as never)
    out.push({ id: 'T gyldigt token, anden kunde', ok: !cross.success, note: cross.success ? 'ACCEPTERET (cross-customer!)' : `afvist (${(cross as { error?: string }).error})` })

    // positiv kontrol
    const ok = await portal.sendPortalMessage(validTok, { customer_id: cust.id, message: `[HARNESS-EX] gyldig ${stamp}` } as never)
    const n = Number((await c.sql(`SELECT count(*)::int n FROM portal_messages WHERE customer_id='${cust.id}' AND message = '[HARNESS-EX] gyldig ${stamp}'`))[0].n)
    out.push({ id: 'T positiv kontrol (gyldigt token)', ok: !!ok.success && n === 1, note: ok.success ? `besked gemt (${n})` : `FEJL: ${(ok as { error?: string }).error}` })
  } finally {
    await c.sql(`DELETE FROM portal_messages WHERE customer_id='${cust.id}' AND message LIKE '[HARNESS-EX]%'`)
    for (const x of created) await c.admin.from(x.table).delete().eq('id', x.id)
  }
  return out
}

export function formatExemptionProofs(c: ProofCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'TOKEN-UNDTAGELSER (dynamisk bevis):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} bevis-checks som forventet`].join('\n')
}
