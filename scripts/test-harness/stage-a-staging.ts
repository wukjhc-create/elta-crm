/**
 * Stage A (automatisk mail → Henvendelser) mod STAGING med den RIGTIGE kode (ingestEmailSource, sweepMissedEmailIntake,
 * reception_ingest i DB). Flag sættes KUN i env-objektet til kaldene — intet miljø ændres. Syntetiske sa-*-data slettes
 * igen (audit-rækker bliver, staging). Ingen afsendelse: udgående tabeller tælles før/efter, og ingen handling udføres.
 *   npx tsx scripts/test-harness/cli.ts stage-a-staging
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Check = { id: string; ok: boolean; note?: string }

export async function runStageAStaging(admin: SupabaseClient, runtime: { url: string; serviceKey: string }, log: (m: string) => void): Promise<number> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = runtime.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = runtime.serviceKey
  const { ingestEmailSource } = await import('../../src/lib/reception/channel-intake')
  const { sweepMissedEmailIntake } = await import('../../src/lib/services/email-sync-orchestrator')
  const { backgroundCapability } = await import('../../src/lib/reception/background-actor')
  const checks: Check[] = []
  const add = (id: string, ok: boolean, note = '') => checks.push({ id, ok, note })
  const tag = `sa${Date.now()}`
  const startIso = new Date().toISOString()
  const SINCE = new Date(Date.now() - 10 * 60_000).toISOString() // "aktiveret" for 10 min siden
  const env = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: SINCE }
  const cap = backgroundCapability(admin)
  const created = { customers: [] as string[], cases: [] as string[], emails: [] as string[] }
  const outboundTables = ['sms_messages', 'email_logs', 'sent_emails', 'outbound_messages', 'portal_messages', 'offer_activities', 'customer_tasks']
  const countOutbound = async () => { const o: Record<string, number> = {}; for (const t of outboundTables) { const r = await admin.from(t).select('id', { count: 'exact', head: true }).gte('created_at', startIso); if (!r.error) o[t] = r.count ?? 0 } return o }
  // eksisterende henvendelser (staging-baseline) må ikke røres
  const preConv = async () => { const r = await admin.from('conversations').select('id, status, customer_id, service_case_id, customer_match_state, match_version').lt('created_at', startIso).order('id'); return JSON.stringify(r.data ?? []) }
  const preItems = async () => (await admin.from('conversation_items').select('id', { count: 'exact', head: true }).lt('created_at', startIso)).count ?? -1
  try {
    const pre0 = await preConv(); const preI0 = await preItems(); const out0 = await countOutbound()
    const adminProfile = (await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()).data as { id: string }
    const mkCust = async (k: string, email: string) => { const r = await admin.from('customers').insert({ company_name: `${tag} ${k}`, contact_person: `Kontakt ${tag} ${k}`, customer_number: `${tag}-${k}`.slice(0, 40), email, created_by: adminProfile.id }).select('id').single(); if (r.error) throw new Error(`kunde ${k}: ${r.error.message}`); created.customers.push(r.data.id); return r.data.id as string }
    const A = await mkCust('A', `${tag}-a@sa-test.dk`); const B = await mkCust('B', `${tag}-b@sa-test.dk`)
    const AMB1 = await mkCust('AMB1', `${tag}-amb@sa-test.dk`); const AMB2 = await mkCust('AMB2', `${tag}-amb@sa-test.dk`)
    const mkCase = async (cust: string, k: string) => { const r = await admin.from('service_cases').insert({ customer_id: cust, title: `${tag} sag ${k}`, status: 'new' }).select('id').single(); if (r.error) throw new Error(`sag: ${r.error.message}`); created.cases.push(r.data.id); return r.data.id as string }
    const caseA1 = await mkCase(A, 'A1'); const caseA2 = await mkCase(A, 'A2'); await mkCase(B, 'B1'); await mkCase(B, 'B2')
    let n = 0
    const mail = async (o: Record<string, unknown>) => {
      const r = await admin.from('incoming_emails').insert({ subject: `${tag} emne`, sender_email: `${tag}-ukendt@sa-test.dk`, sender_name: 'Ukendt', body_preview: 'Hej, mit anlæg virker ikke', received_at: new Date().toISOString(),
        graph_message_id: `${tag}-g${n++}`, link_status: 'unidentified', linked_by: 'auto', to_email: 'kontakt@eltasolar.dk', ...o }).select('id').single()
      if (r.error) throw new Error(`mail: ${r.error.message}`)
      created.emails.push(r.data.id); return r.data.id as string
    }
    const itemOf = async (id: string) => (await admin.from('conversation_items').select('id, conversation_id, sender_label').eq('source_table', 'incoming_emails').eq('source_id', id).maybeSingle()).data as { id: string; conversation_id: string; sender_label: string | null } | null
    const conv = async (id: string) => (await admin.from('conversations').select('id, status, channel, customer_id, customer_candidate_id, customer_match_state, service_case_id, case_candidate_id, case_match_state, urgency, intake_actor').eq('id', id).single()).data as Record<string, unknown>
    const ing = (id: string, e: Record<string, string> = env) => ingestEmailSource(id, { env: e, capability: cap })

    // A: almindelig ny mail efter aktivering
    const m1 = await mail({ conversation_id: `${tag}-T1` })
    const r1 = await ing(m1); const i1 = await itemOf(m1)
    add('A: ny kundemail efter aktivering → created (én henvendelse)', r1.outcome === 'created' && !!i1, JSON.stringify(r1))
    const c1 = i1 ? await conv(i1.conversation_id) : {}
    add('A: ukoblet afsender → ukoblet (ingen kunde gættet), kanal email, baggrundsaktør', c1.customer_id === null && c1.customer_candidate_id === null && c1.channel === 'email' && c1.intake_actor === 'ai_receptionist', JSON.stringify({ s: c1.customer_match_state }))
    // B/C/D: Microsoft-udfald — modtaget for længe siden, opdaget nu
    for (const [label, ms] of [['B: 49 t', 49 * 3_600_000], ['C: 3 døgn', 3 * 86_400_000], ['D: 7 døgn', 7 * 86_400_000]] as const) {
      const m = await mail({ conversation_id: `${tag}-out-${label}`, received_at: new Date(Date.now() - ms).toISOString() })
      const r = await ing(m)
      add(`${label} Microsoft-udfald: modtaget for længe siden, opdaget nu → created`, r.outcome === 'created' && !!(await itemOf(m)), JSON.stringify(r))
    }
    // E/F: historik
    const mE = await mail({ conversation_id: `${tag}-E`, created_at: new Date(Date.now() - 86_400_000).toISOString() })
    const rE = await ing(mE)
    add('E: historisk mail (opdaget før aktivering) → ikke importeret', rE.outcome === 'skipped' && rE.reason === 'discovered_before_activation' && !(await itemOf(mE)), JSON.stringify(rE))
    const mF = await mail({ conversation_id: `${tag}-F`, link_status: 'pending', created_at: new Date(Date.now() - 20 * 86_400_000).toISOString() })
    const rF = await ing(mF)
    add('F: ventende genforsøg af gammel række → ikke importeret', rF.outcome === 'skipped' && !(await itemOf(mF)), JSON.stringify(rF))
    const rNoSince = await ing(m1, { RECEPTION_EMAIL_INGEST_ENABLED: 'true' })
    const mNS = await mail({ conversation_id: `${tag}-NS` })
    const rNS = await ing(mNS, { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: SINCE.slice(0, 16) })
    add('aktiveret uden SINCE / SINCE uden tidszone → intet indtag (fail closed)', rNoSince.reason === 'since_not_configured' && rNS.reason === 'since_not_configured' && !(await itemOf(mNS)), `${rNoSince.reason}/${rNS.reason}`)
    const rOff = await ing(mNS, {})
    add('flag FRA → disabled', rOff.outcome === 'disabled')

    // Dubletter og idempotens
    const rDup = await ing(m1)
    const items1 = (await admin.from('conversation_items').select('id', { count: 'exact', head: true }).eq('source_table', 'incoming_emails').eq('source_id', m1)).count
    add('samme mail indtaget igen (samme Graph-levering / sync kørt to gange) → duplicate, præcis ét item', rDup.outcome === 'duplicate' && items1 === 1, `${rDup.outcome}/${items1}`)
    const dupIns = await admin.from('incoming_emails').insert({ subject: 'x', sender_email: 'x@sa-test.dk', received_at: new Date().toISOString(), graph_message_id: `${tag}-g0` }).select('id')
    if (dupIns.data?.[0]) created.emails.push((dupIns.data[0] as { id: string }).id)
    add('samme Graph-besked leveret to gange → DB afviser anden række (unik graph_message_id)', !!dupIns.error && (dupIns.error.code === '23505'), dupIns.error?.code ?? 'ingen fejl')
    const mC = await mail({ conversation_id: `${tag}-C` })
    const [ra, rb] = await Promise.all([ing(mC), ing(mC)])
    const itemsC = (await admin.from('conversation_items').select('id', { count: 'exact', head: true }).eq('source_table', 'incoming_emails').eq('source_id', mC)).count
    add('to samtidige indtag af samme mail → én created + én duplicate, præcis ét item', [ra.outcome, rb.outcome].sort().join(',') === 'created,duplicate' && itemsC === 1, `${ra.outcome},${rb.outcome}/${itemsC}`)

    // Genforsøg efter fejl (DB-timeout) via afstemningen
    const mT = await mail({ conversation_id: `${tag}-TO` })
    const failingCap = { ...cap, ingest: async () => { throw new Error('statement timeout') } }
    const rT = await ingestEmailSource(mT, { env, capability: failingCap as never })
    add('DB-timeout i indtaget → udfald error (ingen falsk succes), intet item', rT.outcome === 'error' && !(await itemOf(mT)), JSON.stringify(rT))
    const sw = await sweepMissedEmailIntake(admin as never, { env, capability: cap })
    add('afstemningen indtager den fejlede mail ved næste kørsel → created, præcis ét item', !!(await itemOf(mT)) && ((await admin.from('conversation_items').select('id', { count: 'exact', head: true }).eq('source_table', 'incoming_emails').eq('source_id', mT)).count === 1), JSON.stringify(sw.counts))
    const sw2 = await sweepMissedEmailIntake(admin as never, { env, capability: cap })
    add('afstemningen igen → intet nyt (idempotent), historik/E/F stadig ikke importeret', !(await itemOf(mE)) && !(await itemOf(mF)) && !Object.keys(sw2.counts).some((k) => k === 'created'), JSON.stringify(sw2.counts))
    const swOff = await sweepMissedEmailIntake(admin as never, { env: {} })
    add('afstemningen med flag FRA → gør intet', swOff.checked === 0 && Object.keys(swOff.counts).length === 0)
    // AI utilgængelig → deterministisk (fail closed for AI, men henvendelsen oprettes)
    const mAI = await mail({ conversation_id: `${tag}-AI` })
    const rAI = await ingestEmailSource(mAI, { env: { ...env, RECEPTION_LLM_ENABLED: 'true' }, capability: cap })
    add('AI utilgængelig/fejler → henvendelsen oprettes alligevel (deterministisk motor)', rAI.outcome === 'created', JSON.stringify(rAI))
    // Læsefejl
    const rcap = { ...cap, readSource: async () => ({ ok: false, error: 'read_error' }) }
    const rRE = await ingestEmailSource(m1, { env, capability: rcap as never })
    add('læsefejl → read_error (aldrig no-match), intet indtaget', rRE.outcome === 'read_error')
    // Egen postkasse
    const mOwn = await mail({ conversation_id: `${tag}-OWN`, sender_email: 'kontakt@eltasolar.dk' })
    add('ELTAs egen postkasse → skipped (aldrig en kundehenvendelse)', (await ing(mOwn)).reason === 'own_mailbox' && !(await itemOf(mOwn)))

    // Tråde
    const m2 = await mail({ conversation_id: `${tag}-T1`, subject: `Re: ${tag} emne`, body_preview: 'Det sker igen' })
    const r2 = await ing(m2)
    add('svar i samme Microsoft-tråd → appended til samme henvendelse', r2.outcome === 'appended' && (await itemOf(m2))?.conversation_id === i1?.conversation_id, JSON.stringify(r2))
    const m3 = await mail({ conversation_id: `${tag}-T2`, sender_email: `${tag}-anden@sa-test.dk` })
    await ing(m3)
    add('urelateret mail med SAMME emne (anden tråd) → egen henvendelse', (await itemOf(m3))?.conversation_id !== i1?.conversation_id)
    const m4 = await mail({ conversation_id: `${tag}-T3`, body_preview: 'Og så vil jeg gerne have en pris på en ladestander' })
    await ing(m4)
    add('samme afsender, to urelaterede henvendelser (forskellige tråde) → to henvendelser', (await itemOf(m4))?.conversation_id !== i1?.conversation_id)

    // Kunde: manuel = bekræftet; automatisk = kandidat; tvetydig/navn = ingen
    const mMan = await mail({ conversation_id: `${tag}-MAN`, sender_email: `${tag}-a@sa-test.dk`, customer_id: A, linked_by: 'manual', link_status: 'linked' })
    await ing(mMan); const cMan = await conv((await itemOf(mMan))!.conversation_id)
    add('manuelt koblet → bekræftet kunde', cMan.customer_id === A && cMan.customer_match_state === 'confirmed', JSON.stringify({ s: cMan.customer_match_state }))
    const mAuto = await mail({ conversation_id: `${tag}-AUTO`, sender_email: `${tag}-a@sa-test.dk`, customer_id: A, linked_by: 'auto', link_status: 'linked' })
    await ing(mAuto); const cAuto = await conv((await itemOf(mAuto))!.conversation_id)
    add('automatisk koblet → KUN kandidat (aldrig bekræftet)', cAuto.customer_id === null && cAuto.customer_candidate_id === A, JSON.stringify({ s: cAuto.customer_match_state }))
    const mAmb = await mail({ conversation_id: `${tag}-AMB`, sender_email: `${tag}-amb@sa-test.dk` })
    await ing(mAmb); const cAmb = await conv((await itemOf(mAmb))!.conversation_id)
    add('tvetydig (to kunder med samme e-mail, ukoblet mail) → ingen gættet kunde', cAmb.customer_id === null && cAmb.customer_candidate_id === null, JSON.stringify({ s: cAmb.customer_match_state }))
    void AMB1; void AMB2
    const mName = await mail({ conversation_id: `${tag}-NAME`, sender_email: `${tag}-fremmed@sa-test.dk`, sender_name: `Kontakt ${tag} A` })
    await ing(mName); const cName = await conv((await itemOf(mName))!.conversation_id)
    add('kun navne-match → ingen kunde (intet navne-auto-match)', cName.customer_id === null && cName.customer_candidate_id === null)

    // Sag: kun deterministisk (manuelt koblet + samme kunde)
    const mCase = await mail({ conversation_id: `${tag}-CASE`, sender_email: `${tag}-a@sa-test.dk`, customer_id: A, linked_by: 'manual', link_status: 'linked', service_case_id: caseA1 })
    await ing(mCase); const cCase = await conv((await itemOf(mCase))!.conversation_id)
    add('manuelt koblet mail med kundens sag → bekræftet sag', cCase.service_case_id === caseA1 && cCase.case_match_state === 'confirmed', JSON.stringify({ s: cCase.case_match_state }))
    const mCaseAuto = await mail({ conversation_id: `${tag}-CASEAUTO`, sender_email: `${tag}-a@sa-test.dk`, customer_id: A, linked_by: 'auto', link_status: 'linked', service_case_id: caseA1 })
    await ing(mCaseAuto); const cCA = await conv((await itemOf(mCaseAuto))!.conversation_id)
    add('automatisk koblet mail med sag → ingen bekræftet sag (gættes ikke)', cCA.service_case_id === null, JSON.stringify({ s: cCA.case_match_state }))
    const mB = await mail({ conversation_id: `${tag}-BCASES`, sender_email: `${tag}-b@sa-test.dk`, customer_id: B, linked_by: 'manual', link_status: 'linked' })
    await ing(mB); const cB = await conv((await itemOf(mB))!.conversation_id)
    add('kunde med flere åbne sager, ingen sag på mailen → ingen automatisk sag', cB.service_case_id === null && cB.customer_id === B)
    const mCase2 = await mail({ conversation_id: `${tag}-CASE`, sender_email: `${tag}-a@sa-test.dk`, customer_id: A, linked_by: 'manual', link_status: 'linked', service_case_id: caseA2 })
    await ing(mCase2)
    add('bekræftet SAGS-konflikt i samme tråd → separat henvendelse', (await itemOf(mCase2))?.conversation_id !== (await itemOf(mCase))?.conversation_id)
    const mConf = await mail({ conversation_id: `${tag}-MAN`, sender_email: `${tag}-b@sa-test.dk`, customer_id: B, linked_by: 'manual', link_status: 'linked' })
    await ing(mConf)
    add('bekræftet KUNDE-konflikt i samme tråd → separat henvendelse', (await itemOf(mConf))?.conversation_id !== (await itemOf(mMan))?.conversation_id)
    const mCand = await mail({ conversation_id: `${tag}-MAN`, sender_email: `${tag}-b@sa-test.dk`, customer_id: B, linked_by: 'auto', link_status: 'linked' })
    await ing(mCand)
    add('anden kunde (kandidat) svarer i tråden → separat henvendelse', (await itemOf(mCand))?.conversation_id !== (await itemOf(mMan))?.conversation_id)
    // Fremmed (ukendt afsender, ingen kandidat) i en tråd med ÉN bekræftet kunde-henvendelse
    const mS0 = await mail({ conversation_id: `${tag}-STR`, sender_email: `${tag}-a@sa-test.dk`, sender_name: 'Kunde A', customer_id: A, linked_by: 'manual', link_status: 'linked' })
    await ing(mS0); const iS0 = await itemOf(mS0)
    const mStr = await mail({ conversation_id: `${tag}-STR`, sender_email: `${tag}-fremmed2@sa-test.dk`, sender_name: 'Fremmed' })
    const rStr = await ing(mStr); const iStr = await itemOf(mStr)
    const strMail = (await admin.from('incoming_emails').select('customer_id, linked_by').eq('id', mStr).single()).data as { customer_id: string | null }
    const cStr = iStr ? await conv(iStr.conversation_id) : {}
    add('fremmed i kundens Microsoft-tråd: eget item med EGEN afsender-label; fremmedes mail kobles IKKE til kunden; henvendelsens kunde uændret (kun forslag)',
      rStr.outcome === 'appended' && !!iStr && iStr.id !== iS0?.id && iStr.sender_label !== iS0?.sender_label && strMail.customer_id === null && cStr.customer_id === A,
      JSON.stringify({ outcome: rStr.outcome, own_label: iStr?.sender_label !== iS0?.sender_label }))
    // Tråd med FLERE åbne henvendelser (A bekræftet, B bekræftet, B kandidat): en afsender uden identitet føjes til den
    // senest aktive — registreres (S3), mailens egen identitet forbliver ukoblet
    const mStr2 = await mail({ conversation_id: `${tag}-MAN`, sender_email: `${tag}-fremmed3@sa-test.dk`, sender_name: 'Fremmed 3' })
    const rStr2 = await ing(mStr2)
    const str2Mail = (await admin.from('incoming_emails').select('customer_id').eq('id', mStr2).single()).data as { customer_id: string | null }
    add('(registrering) fremmed i tråd med flere åbne henvendelser → føjes til den senest aktive; mailen forbliver ukoblet', ['appended', 'created'].includes(rStr2.outcome) && str2Mail.customer_id === null, rStr2.outcome)
    // Håndteret henvendelse genåbnes ikke
    const hUpd = await admin.from('conversations').update({ status: 'handled', handled_at: new Date().toISOString() }).eq('id', (await itemOf(mB))!.conversation_id).select('id')
    add('(opsætning) henvendelse markeret håndteret', !hUpd.error && (hUpd.data ?? []).length === 1, hUpd.error?.message ?? '')
    const mH = await mail({ conversation_id: `${tag}-BCASES`, sender_email: `${tag}-b@sa-test.dk`, customer_id: B, linked_by: 'manual', link_status: 'linked' })
    await ing(mH)
    const hConv = await conv((await itemOf(mB))!.conversation_id)
    add('svar i tråd til en HÅNDTERET henvendelse → ny henvendelse; den håndterede genåbnes ikke', (await itemOf(mH))?.conversation_id !== (await itemOf(mB))?.conversation_id && hConv.status === 'handled')

    // Kun forslag, intet udført, intet sendt; eksisterende henvendelser urørte
    const convIds = [...new Set((await admin.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').in('source_id', created.emails)).data?.map((x) => (x as { conversation_id: string }).conversation_id) ?? [])]
    const acts = convIds.length ? (await admin.from('conversation_actions').select('state').in('conversation_id', convIds)).data as Array<{ state: string }> : []
    add('ingen handling udført/godkendt af Stage A (kun forslag/blokeret)', acts.every((a) => ['proposed', 'blocked'].includes(a.state)), [...new Set(acts.map((a) => a.state))].join(','))
    const out1 = await countOutbound()
    add('intet sendt: ingen nye rækker i udgående tabeller (SMS/mail/portal/opgaver/tilbudsaktivitet)', JSON.stringify(out0) === JSON.stringify(out1), `${JSON.stringify(out0)} → ${JSON.stringify(out1)}`)
    add('eksisterende henvendelser (før testen) uændrede: status, kunde, sag, match, version; antal items uændret', pre0 === await preConv() && preI0 === await preItems())
    const items = convIds.length ? (await admin.from('conversation_items').select('source_id').in('conversation_id', convIds)).data as Array<{ source_id: string }> : []
    const perSrc = new Map<string, number>(); for (const it of items) perSrc.set(it.source_id, (perSrc.get(it.source_id) ?? 0) + 1)
    add('præcis ét item pr. kanonisk mail (ingen dublet-items)', [...perSrc.values()].every((v) => v === 1), `${perSrc.size} mails`)
  } catch (e) {
    add('opsætning/kørsel', false, String((e as Error).message).slice(0, 200))
  } finally {
    const convIds = created.emails.length ? [...new Set((await admin.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').in('source_id', created.emails)).data?.map((x) => (x as { conversation_id: string }).conversation_id) ?? [])] : []
    if (convIds.length) {
      await admin.from('conversation_actions').delete().in('conversation_id', convIds)
      await admin.from('conversation_items').delete().in('conversation_id', convIds)
      await admin.from('conversations').delete().in('id', convIds)
    }
    if (created.emails.length) await admin.from('incoming_emails').delete().in('id', created.emails)
    if (created.cases.length) await admin.from('service_cases').delete().in('id', created.cases)
    if (created.customers.length) { await admin.from('customer_tasks').delete().in('customer_id', created.customers); await admin.from('customers').delete().in('id', created.customers) }
  }
  for (const c of checks) log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}${c.note ? ` (${c.note})` : ''}`)
  const failed = checks.filter((c) => !c.ok).length
  log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — Stage A (staging, rigtig kode)`)
  return failed ? 2 : 0
}
