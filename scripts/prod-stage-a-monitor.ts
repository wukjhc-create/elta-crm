/**
 * Stage A — PRODUCTION READ ONLY overvågning før/efter aktivering. Kun id'er (UUID), kategorier og antal — aldrig emne,
 * afsender, navne eller indhold.
 *   npx tsx scripts/prod-stage-a-monitor.ts baseline --save <fil>            (FØR aktivering: de eksisterende henvendelser)
 *   npx tsx scripts/prod-stage-a-monitor.ts after --since <ISO> --baseline <fil>   (EFTER: mail ↔ henvendelse pr. ny mail)
 * after: for hver indgående mail opdaget ≥ since: har den præcis ét item? henvendelse, udfald (created/appended), kunde-
 * og sagstilstand, hastegrad, kanal; mails UDEN item med sandsynlig årsag; reception-sundhed; baseline uændret; intet sendt.
 */
import { readFileSync, writeFileSync } from 'fs'
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'after' ? 'after' : 'baseline'
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const CONV_FP = `md5(coalesce(string_agg((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text, '|' ORDER BY x.id), ''))`

withProdReadOnly(`prod-stage-a-monitor ${mode}`, async (run) => {
  if (mode === 'baseline') {
    const convs = await run(`SELECT id::text, md5((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text) h FROM public.conversations x ORDER BY id`)
    const agg = (await run(`SELECT (SELECT count(*)::int FROM conversations) conv, (SELECT count(*)::int FROM conversation_items) items, (SELECT count(*)::int FROM conversation_actions) actions,
      (SELECT ${CONV_FP} FROM conversations x) conv_md5, (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM conversation_actions x) actions_md5,
      (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM conversation_items x) items_md5,
      (SELECT string_agg(state || '=' || n, ',' ORDER BY state) FROM (SELECT state, count(*) n FROM conversation_actions GROUP BY state) s) action_states`))[0]
    console.log(`INFO  baseline: ${JSON.stringify(agg)}`)
    const file = argOf('--save')
    if (file) { writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), agg, convs }, null, 2)); console.log(`INFO  gemt: ${file} (${convs.length} henvendelser)`) }
    return
  }
  const sinceArg = argOf('--since') ?? ''
  if (Number.isNaN(Date.parse(sinceArg))) throw new Error('kræver --since ISO')
  const since = new Date(sinceArg).toISOString()
  const res: Array<[string, boolean, string]> = []
  const rows = await run(`SELECT e.id::text mail_id, e.link_status::text ls, (e.sender_email ILIKE '%@eltasolar.dk') own, (e.customer_id IS NOT NULL) linked, e.linked_by,
      (SELECT count(*)::int FROM conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = e.id) n_items,
      (SELECT i.conversation_id::text FROM conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = e.id LIMIT 1) conv_id
    FROM incoming_emails e WHERE e.created_at >= '${since}'::timestamptz ORDER BY e.created_at`)
  const convIds = [...new Set(rows.map((r) => r.conv_id).filter(Boolean))] as string[]
  const convs = convIds.length ? await run(`SELECT id::text, channel, status, urgency, customer_match_state cm, case_match_state sm, (customer_id IS NOT NULL) confirmed, (customer_candidate_id IS NOT NULL) candidate, (service_case_id IS NOT NULL) has_case, intake_actor,
      (SELECT count(*)::int FROM conversation_items i WHERE i.conversation_id = c.id) items, (created_at >= '${since}'::timestamptz) new_conv FROM conversations c WHERE id::text IN (${convIds.map((x) => `'${x.replace(/[^0-9a-f-]/g, '')}'`).join(',')})`) : []
  const byConv = new Map(convs.map((c) => [c.id as string, c]))
  console.log('mail_id                               link        → henvendelse                          ny?  kanal    kunde                 sag            hast    items')
  for (const r of rows) {
    const c = r.conv_id ? byConv.get(r.conv_id) : null
    const why = r.n_items ? '' : r.own ? 'egen postkasse (skipped)' : r.ls === 'pending' ? 'ikke færdigbehandlet af mail-sync endnu' : r.ls === 'ignored' ? 'ignoreret (nyhedsbrev/system)' : 'INTET ITEM — tjek reception-sundhed / afstemning'
    console.log(`${r.mail_id} ${String(r.ls).padEnd(11)} → ${c ? `${c.id} ${c.new_conv ? 'ny ' : 'gml'} ${String(c.channel).padEnd(8)} ${(c.confirmed ? 'bekræftet' : c.candidate ? 'kandidat' : String(c.cm)).padEnd(21)} ${String(c.has_case ? 'sag' : c.sm).padEnd(14)} ${String(c.urgency).padEnd(7)} ${c.items}` : why}`)
  }
  const inbound = rows.filter((r) => !r.own && r.ls !== 'ignored' && r.ls !== 'pending')
  res.push(['hver færdigbehandlet indgående mail siden aktivering har præcis ét item', inbound.every((r) => r.n_items === 1), `${inbound.filter((r) => r.n_items !== 1).length} afvigende af ${inbound.length}`])
  res.push(['ingen mail har mere end ét item', rows.every((r) => r.n_items <= 1), ''])
  res.push(['egne postkasser er aldrig blevet til en henvendelse', rows.filter((r) => r.own).every((r) => r.n_items === 0), ''])
  res.push(['manuelt koblede mails giver bekræftet kunde; automatiske aldrig bekræftet', rows.filter((r) => r.conv_id && r.linked).every((r) => { const c = byConv.get(r.conv_id); return !c || !c.new_conv || (r.linked_by === 'manual' ? true : !c.confirmed || c.items > 1) }), ''])
  const acts = convIds.length ? await run(`SELECT state, count(*)::int n FROM conversation_actions WHERE conversation_id::text IN (${convIds.map((x) => `'${x.replace(/[^0-9a-f-]/g, '')}'`).join(',')}) GROUP BY 1`) : []
  res.push(['ingen handling udført/godkendt for de nye henvendelser (kun forslag/blokeret)', acts.every((a) => ['proposed', 'blocked'].includes(a.state)), JSON.stringify(acts)])
  const health = await run(`SELECT status, count(*)::int n, max(created_at)::text last FROM system_health_log WHERE service = 'reception' AND created_at >= '${since}'::timestamptz GROUP BY 1`)
  console.log(`INFO  reception-sundhed siden aktivering: ${JSON.stringify(health)}`)
  res.push(['ingen reception-advarsler (fejl/læsefejl/konfiguration) siden aktivering', !health.some((h) => h.status !== 'ok'), JSON.stringify(health)])
  const out = (await run(`SELECT (SELECT count(*)::int FROM sms_messages WHERE created_at >= '${since}'::timestamptz) sms,
      (SELECT count(*)::int FROM portal_messages WHERE created_at >= '${since}'::timestamptz AND sender_type <> 'customer') portal_out,
      (SELECT count(*)::int FROM telephony_calls WHERE created_at >= '${since}'::timestamptz) calls`))[0]
  res.push(['intet udgående fra hub\'en: 0 SMS, 0 opkald (portal-svar fra medarbejdere vises som tal)', out.sms === 0 && out.calls === 0, JSON.stringify(out)])
  const bfile = argOf('--baseline')
  if (bfile) {
    const b = JSON.parse(readFileSync(bfile, 'utf8')) as { convs: Array<{ id: string; h: string }>; agg: { actions_md5: string } }
    const now = await run(`SELECT id::text, md5((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text) h FROM public.conversations x WHERE id::text IN (${b.convs.map((c) => `'${c.id.replace(/[^0-9a-f-]/g, '')}'`).join(',') || "''"})`)
    const m = new Map(now.map((r) => [r.id as string, r.h as string]))
    const changed = b.convs.filter((c) => m.get(c.id) !== c.h).length
    res.push([`baseline-henvendelserne (${b.convs.length}) uændrede (kunde, sag, status, forslag) — medmindre en medarbejder har behandlet dem`, changed === 0, `${changed} ændret`])
    const a = (await run(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) m FROM conversation_actions x WHERE conversation_id::text IN (${b.convs.map((c) => `'${c.id.replace(/[^0-9a-f-]/g, '')}'`).join(',') || "''"})`))[0].m
    res.push(['baseline-forslag (handlinger) uændrede', a === b.agg.actions_md5, ''])
  }
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
