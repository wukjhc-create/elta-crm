/**
 * O-1 (review 2026-10-16, Henrik: LIVE BLOCKED) på staging: planOfferReminders med admin-klienten (som cron'en) —
 * INTET sendes, intet tilbud ændres.
 *   R1  sendt for 5 dage siden, aktiv kunde med mail → "ville sende" (modtager = kundens mail; portal-link fundet)
 *   R2  accepteret / afvist / udløbet (gyldig-til i går) → udelukket med årsag
 *   R3  rykket i går → cooldown
 *   R4  maks. antal rykkere nået → udelukket
 *   R5  samme modtager to gange → dublet udelukket (dedup pr. modtager)
 *   R6  kunde med pladsholder-mail (auto+…@elta-crm.local) og uden faktureringskontakt → "ingen modtager"
 *   R7  planen ændrer intet: reminder_count/last_reminder_sent uændrede på alle seedede tilbud
 *   R8  offerRemindersLive() er false (OFFER_REMINDERS_LIVE ikke sat)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface OrCheck { id: string; ok: boolean; note: string }

export async function runOfferReminderPlanCheck(c: { admin: SupabaseClient }): Promise<OrCheck[]> {
  const out: OrCheck[] = []
  const { planOfferReminders, offerRemindersLive } = await import('../../src/lib/offers/offer-reminder-plan')
  const admin = c.admin
  const stamp = Date.now()
  const day = 86_400_000
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
  const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const made = { customers: [] as string[], offers: [] as string[], tokens: [] as string[] }
  const ins = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(t).insert([row]).select('id').single()
    if (error) throw new Error(`seed ${t}: ${error.message}`)
    return (data as { id: string }).id
  }
  let n = 0
  const mkCustomer = async (email: string) => {
    n++
    const id = await ins('customers', { customer_number: `HOR-${stamp}-${n}`, company_name: `[HARNESS] rykker ${stamp} ${n}`, contact_person: 'Rykker Kontakt', email, created_by: owner })
    made.customers.push(id)
    return id
  }
  const mkOffer = async (cust: string, o: Record<string, unknown>) => {
    n++
    const id = await ins('offers', { offer_number: `HOR-${stamp}-${n}`, title: `[HARNESS] rykker ${n}`, customer_id: cust, status: 'sent',
      sent_at: iso(5 * day), valid_until: '2099-12-31', reminder_count: 0, last_reminder_sent: null, tax_percentage: 25, created_by: owner, ...o })
    made.offers.push(id)
    return id
  }
  try {
    const cA = await mkCustomer(`hor-a-${stamp}@harness.test`)
    const cB = await mkCustomer(`hor-b-${stamp}@harness.test`)
    const cNone = await mkCustomer(`auto+${stamp}@elta-crm.local`)
    const tok = await ins('portal_access_tokens', { customer_id: cA, email: `hor-a-${stamp}@harness.test`, token: `hor${stamp}${Math.random().toString(36).slice(2)}`, is_active: true, created_by: owner })
    made.tokens.push(tok)

    const okOffer = await mkOffer(cA, {})
    const dupOffer = await mkOffer(cA, { sent_at: iso(6 * day) })
    const accepted = await mkOffer(cB, { status: 'accepted' })
    const rejected = await mkOffer(cB, { status: 'rejected' })
    const expired = await mkOffer(cB, { valid_until: new Date(Date.now() - day).toISOString().slice(0, 10) })
    const cooldown = await mkOffer(cB, { reminder_count: 1, last_reminder_sent: iso(1 * day) })
    const maxed = await mkOffer(cB, { reminder_count: 3, last_reminder_sent: iso(10 * day) })
    const noRecipient = await mkOffer(cNone, {})

    const before = (await admin.from('offers').select('id, reminder_count, last_reminder_sent').in('id', made.offers)).data ?? []
    const plan = await planOfferReminders(admin)
    const all = [...plan.wouldSend, ...plan.excluded]
    const find = (id: string) => all.find((i) => i.offerId === id)

    // R1 + R5: den ene af cA's to tilbud sendes, den anden er dublet (eller loft, hvis staging har ≥5 andre berettigede)
    const a = [find(okOffer), find(dupOffer)]
    const sent = a.filter((i) => i && i.excluded === null)
    const dup = a.filter((i) => i && i.excluded === 'duplicate_recipient')
    const capped = a.filter((i) => i && i.excluded === 'run_cap')
    out.push({ id: 'R1 berettiget tilbud → ville sende til kundens mail med portal-link',
      ok: (sent.length === 1 && sent[0]!.recipientEmail === `hor-a-${stamp}@harness.test` && !!sent[0]!.portalUrl?.includes('/portal/')) || capped.length > 0,
      note: sent.length ? `→ ${sent[0]!.recipientEmail} · portal=${sent[0]!.portalUrl?.includes('/portal/') ? 'ja' : 'nej'}` : `loft=${capped.length} (staging har mange berettigede)` })
    out.push({ id: 'R5 samme modtager to gange → dublet udelukket', ok: dup.length === 1 || capped.length > 0, note: `dublet=${dup.length} loft=${capped.length}` })
    const reason = (id: string) => find(id)?.excluded ?? 'ikke i planen'
    out.push({ id: 'R2 accepteret/afvist/udløbet udelukket', ok: !find(accepted) && !find(rejected) && reason(expired) === 'expired',
      note: `accepteret=${find(accepted) ? 'med' : 'ikke hentet'} afvist=${find(rejected) ? 'med' : 'ikke hentet'} udløbet=${reason(expired)}` })
    out.push({ id: 'R3 rykket i går → cooldown', ok: reason(cooldown) === 'cooldown', note: String(reason(cooldown)) })
    out.push({ id: 'R4 maks. rykkere nået → udelukket', ok: reason(maxed) === 'max_count', note: String(reason(maxed)) })
    out.push({ id: 'R6 pladsholder-mail (.local) → ingen modtager', ok: reason(noRecipient) === 'no_recipient', note: String(reason(noRecipient)) })

    const after = (await admin.from('offers').select('id, reminder_count, last_reminder_sent').in('id', made.offers)).data ?? []
    const same = JSON.stringify([...before].sort((x, y) => String(x.id).localeCompare(String(y.id)))) === JSON.stringify([...after].sort((x, y) => String(x.id).localeCompare(String(y.id))))
    out.push({ id: 'R7 planen ændrer intet (reminder_count/last_reminder_sent uændret)', ok: same, note: same ? 'uændret' : 'ÆNDRET' })
    out.push({ id: 'R8 live er slået fra', ok: offerRemindersLive() === false && plan.live === false, note: `live=${plan.live}` })
  } catch (err) {
    out.push({ id: 'SEED', ok: false, note: err instanceof Error ? err.message : String(err) })
  } finally {
    if (made.offers.length) await admin.from('offers').delete().in('id', made.offers)
    if (made.tokens.length) await admin.from('portal_access_tokens').delete().in('id', made.tokens)
    if (made.customers.length) await admin.from('customers').delete().in('id', made.customers)
  }
  return out
}

export function formatOfferReminderPlanCheck(checks: OrCheck[]): string {
  const lines = checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`)
  const passed = checks.filter((c) => c.ok).length
  return `${lines.join('\n')}\n\n${passed}/${checks.length} ${passed === checks.length ? '✅' : '❌'}`
}
