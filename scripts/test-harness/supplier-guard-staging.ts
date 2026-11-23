/**
 * Leverandør-/kunde-integritetsværn mod STAGING med RIGTIG kode (2026-11-23). Syntetiske sg252-*-data slettes igen.
 * Dækker: supplier-senders mod rigtige tabeller · autolink (veto, rigtig admin-klient) · Stage A ingestEmailSource med den
 * rigtige baggrundskapabilitet (00249/00250 på staging) for leverandør med forurenet kunderække, normal kunde, manuel
 * kobling og ukendt afsender. Intet sendes (Stage A har ingen afsendervej).
 *   npx tsx scripts/test-harness/cli.ts supplier-guard-staging
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function runSupplierGuardStaging(admin: SupabaseClient, runtime: { url: string; serviceKey: string }, log: (m: string) => void): Promise<number> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = runtime.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = runtime.serviceKey
  const { classifySupplierSender, clearSupplierSenderCache } = await import('../../src/lib/email/supplier-senders')
  const { gatherAutoLinkSignals } = await import('../../src/lib/services/email-autolink')
  const { ingestEmailSource } = await import('../../src/lib/reception/channel-intake')
  const { backgroundCapability } = await import('../../src/lib/reception/background-actor')
  const checks: Array<{ id: string; ok: boolean; note?: string }> = []
  const add = (id: string, ok: boolean, note = '') => checks.push({ id, ok, note })
  const tag = `sg252-${Date.now()}`
  const supDomain = `${tag}-lev.dk`
  const supEmail = `faktura@${supDomain}`
  const custEmail = `${tag}-kunde@example-kunde.dk`
  const created = { customers: [] as string[], emails: [] as string[], logs: [] as string[] }
  const activation = new Date(Date.now() - 3_600_000).toISOString()
  const env = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: activation }
  const cap = backgroundCapability(admin)
  try {
    const adminProfile = (await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()).data as { id: string }
    const mkCust = async (k: string, email: string, tags: string[]) => {
      const r = await admin.from('customers').insert({ company_name: `${tag} ${k}`, contact_person: k, customer_number: `${tag}-${k}`.slice(0, 40), email, created_by: adminProfile.id, tags }).select('id').single()
      if (r.error) throw new Error(`kunde ${k}: ${r.error.message}`); created.customers.push(r.data.id); return r.data.id as string
    }
    const polluted = await mkCust('POLLUTED', supEmail, ['auto-email'])
    const customer = await mkCust('KUNDE', custEmail, [])
    const mkMail = async (sender: string, over: Record<string, unknown> = {}) => {
      const r = await admin.from('incoming_emails').insert({ subject: `${tag} mail`, sender_email: sender, received_at: new Date().toISOString(), graph_message_id: `${tag}-${Math.random()}`, conversation_id: `${tag}-T-${Math.random()}`, link_status: 'unidentified', body_preview: 'Levering til kunde Jensen, tlf 20304050', ...over }).select('id').single()
      if (r.error) throw new Error(`mail: ${r.error.message}`); created.emails.push(r.data.id); return r.data.id as string
    }
    // historik: to tidligere mails fra leverandøren klassificeret 'supplier' (opdaget før aktivering → indtages ikke)
    for (let i = 0; i < 2; i++) {
      const old = await mkMail(supEmail, { created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), customer_id: polluted, link_status: 'linked', linked_by: 'auto-ai' })
      const l = await admin.from('email_intelligence_logs').insert({ email_id: old, subject: `${tag} old`, classification: 'supplier', action: 'matched', reason: 'harness', customer_id: polluted }).select('id').single()
      if (l.error) throw new Error(`log: ${l.error.message}`); created.logs.push(l.data.id)
    }
    clearSupplierSenderCache()
    // 1. værnet mod rigtige tabeller
    const g = await classifySupplierSender(admin, supEmail, { noCache: true })
    add('B/C: afsender med forurenet kunderække + leverandør-historik → leverandør (rigtige tabeller)', g.isSupplier && g.reasons.includes('sender_history_supplier'), JSON.stringify(g))
    add('E: normal kunde → ikke leverandør', !(await classifySupplierSender(admin, custEmail, { noCache: true })).isSupplier)
    add('A: kendt grossist-domæne → leverandør', (await classifySupplierSender(admin, `ordre@ao.dk`, { noCache: true })).isSupplier)
    add('G: ukendt afsender → ikke leverandør', !(await classifySupplierSender(admin, `${tag}@ukendt-firma.dk`, { noCache: true })).isSupplier)
    // 2. autolink-veto (rigtig admin-klient): den forurenede kunderække må ikke blive et signal
    const newSup = await mkMail(supEmail)
    const sig = await gatherAutoLinkSignals(admin as never, newSup, supEmail, null)
    add('B: autolink — eksakt kunde-e-mail (forurenet) giver INGEN kundesignal for leverandør-afsender', sig.supplier === true && sig.signals.exactCustomerIds.length === 0 && sig.signals.domainCustomerIds.length === 0)
    const custMail = await mkMail(custEmail)
    const sigC = await gatherAutoLinkSignals(admin as never, custMail, custEmail, null)
    add('E: autolink — normal kunde giver stadig eksakt kundesignal', !sigC.supplier && sigC.signals.exactCustomerIds.includes(customer))
    // 3. Stage A med rigtig kapabilitet
    const conv = async (mailId: string) => {
      const it = (await admin.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').eq('source_id', mailId).maybeSingle()).data as { conversation_id: string } | null
      if (!it) return null
      return (await admin.from('conversations').select('id, customer_id, customer_candidate_id, customer_match_state, service_case_id, case_candidate_id, handoff_reasons, intake_actor').eq('id', it.conversation_id).single()).data as Record<string, unknown>
    }
    const rS = await ingestEmailSource(newSup, { env, capability: cap })
    const cS = await conv(newSup)
    add('I: leverandørmail → intern henvendelse oprettet', rS.outcome === 'created' && !!cS, JSON.stringify(rS))
    add('B/I: ingen kundekandidat (heller ikke den forurenede kunderække), ingen bekræftet kunde', !!cS && cS.customer_candidate_id === null && cS.customer_id === null && cS.customer_match_state === 'no_match', JSON.stringify(cS))
    add("I: intern årsag 'supplier_sender', ingen sag/sags-kandidat", !!cS && (cS.handoff_reasons as string[]).includes('supplier_sender') && cS.service_case_id === null && cS.case_candidate_id === null)
    const acts = cS ? ((await admin.from('conversation_actions').select('state').eq('conversation_id', cS.id as string)).data ?? []) as Array<{ state: string }> : []
    add('I: kun forslag/blokerede handlinger (intet udført)', acts.every((a) => ['proposed', 'blocked'].includes(a.state)), JSON.stringify(acts))
    const rC = await ingestEmailSource(custMail, { env, capability: cap })
    const cC = await conv(custMail)
    add('E: normal kunde → kundekandidat som før (ingen supplier_sender)', rC.outcome === 'created' && cC?.customer_candidate_id === customer && cC?.customer_match_state === 'unique_match' && !(cC?.handoff_reasons as string[]).includes('supplier_sender'), JSON.stringify(cC))
    const manual = await mkMail(supEmail, { customer_id: polluted, linked_by: 'manual', link_status: 'linked' })
    await ingestEmailSource(manual, { env, capability: cap })
    const cM = await conv(manual)
    add('F: manuel kobling af leverandørmail → bekræftet kunde (menneske har afgjort det); manuel kobling stadig mulig', cM?.customer_id === polluted, JSON.stringify(cM))
    const unknown = await mkMail(`${tag}@ukendt-firma.dk`)
    const rU = await ingestEmailSource(unknown, { env, capability: cap })
    const cU = await conv(unknown)
    add('G: ukendt afsender → uændret (no_match, ingen supplier_sender)', rU.outcome === 'created' && cU?.customer_match_state === 'no_match' && !(cU?.handoff_reasons as string[]).includes('supplier_sender'))
    const pollutedRow = (await admin.from('customers').select('id, email, tags').eq('id', polluted).single()).data as { email: string; tags: string[] }
    add('forurenet kunderække er IKKE ændret eller slettet', pollutedRow.email === supEmail && pollutedRow.tags.includes('auto-email'))
  } catch (e) {
    add('opsætning', false, String((e as Error).message).slice(0, 200))
  } finally {
    const convIds = created.emails.length ? ((await admin.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').in('source_id', created.emails)).data ?? []).map((r) => (r as { conversation_id: string }).conversation_id) : []
    if (convIds.length) { await admin.from('conversation_actions').delete().in('conversation_id', convIds); await admin.from('conversation_items').delete().in('conversation_id', convIds); await admin.from('conversations').delete().in('id', convIds) }
    if (created.logs.length) await admin.from('email_intelligence_logs').delete().in('id', created.logs)
    if (created.emails.length) await admin.from('incoming_emails').delete().in('id', created.emails)
    if (created.customers.length) await admin.from('customers').delete().in('id', created.customers)
  }
  for (const c of checks) log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}${!c.ok && c.note ? ` (${c.note})` : ''}`)
  const failed = checks.filter((c) => !c.ok).length
  log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — leverandør-/kunde-værn (staging, rigtig kode)`)
  return failed ? 2 : 0
}
