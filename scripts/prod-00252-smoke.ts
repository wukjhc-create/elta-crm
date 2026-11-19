/**
 * 00252 — PRODUCTION smoke (read-only DB + HTTP uden sideeffekter). Ingen login, intet oprettet, intet sendt.
 *   npx tsx scripts/prod-00252-smoke.ts --stage old --since <migration-ISO>   (trin 4: gammel kode 4487efd2 på nyt skema)
 *   npx tsx scripts/prod-00252-smoke.ts --stage new --since <deploy-ISO>      (trin 7–10: ny kode 6f901e2c)
 * - portal: ukendt token → /portal/invalid; portal-PDF med ugyldigt token → 401; uden parametre → 400
 * - opgaver: kolonnen findes; kundesynlige opgaver er KUN bookinger/portal-anmodninger oprettet efter --since
 * - gammel kodes forespørgsler (portal-opgaver + rykker uden flag) virker på skemaet (stage old)
 * - tilbudsprojektion (ny kode) over alle portal-synlige tilbud: ingen kost/margin/noter; salgstal = databasens
 * - rykker (ny kode): udvælgelsen giver kun kundesynlige, afventende, fremtidige bookinger (intet sendes)
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { PORTAL_OFFER_COLUMNS, PORTAL_LINE_ITEM_COLUMNS, PORTAL_TASK_COLUMNS, findForbiddenPortalKeys } from '../src/lib/portal/projections'
import { shouldRemindBesigtigelse, isPortalVisibleBesigtigelse } from '../src/lib/tasks/besigtigelse-task'

const PROD_URL = 'https://elta-crm.vercel.app'
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? String(process.argv[i + 1] ?? '') : '' }
const stage = arg('--stage') === 'new' ? 'new' : 'old'
const since = arg('--since')
if (Number.isNaN(Date.parse(since))) throw new Error('kræver --since ISO')
const iso = new Date(since).toISOString()

async function main() {
  const res: Array<[string, boolean, string]> = []
  const bad = 'f'.repeat(64)
  const p = await fetch(`${PROD_URL}/portal/${bad}`, { redirect: 'manual' })
  // Next streamer redirect() fra en server-komponent som 200 + NEXT_REDIRECT i payloaden (eller 30x med location)
  const pBody = [302, 303, 307, 308].includes(p.status) ? (p.headers.get('location') ?? '') : await p.text()
  res.push(['portal: ukendt token → /portal/invalid (ingen data)', /NEXT_REDIRECT;replace;\/portal\/invalid|^\/portal\/invalid/.test(pBody) || /\/portal\/invalid/.test(p.headers.get('location') ?? ''), `HTTP ${p.status}`])
  const pdf = await fetch(`${PROD_URL}/api/portal/offers/pdf?token=${bad}&offerId=00000000-0000-0000-0000-000000000000`, { redirect: 'manual' })
  res.push(['portal-PDF: ugyldigt token → 401', pdf.status === 401, `HTTP ${pdf.status}`])
  const pdf2 = await fetch(`${PROD_URL}/api/portal/offers/pdf`, { redirect: 'manual' })
  res.push(['portal-PDF: uden parametre → 400', pdf2.status === 400, `HTTP ${pdf2.status}`])

  await withProdReadOnly(`prod-00252-smoke ${stage}`, async (run) => {
    const col = (await run(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'`))[0].n
    res.push(['customer_tasks.customer_visible findes (00252 anvendt)', col === 1, `${col}`])
    if (col !== 1) return
    const vis = await run(`SELECT id, title, auto_rule, customer_visible, (created_at > '${iso}'::timestamptz) AS after_since FROM public.customer_tasks WHERE customer_visible`)
    const odd = vis.filter((t) => !t.after_since || !isPortalVisibleBesigtigelse(t))
    res.push([`kundesynlige opgaver (${vis.length}) er alle nye bookinger/portal-anmodninger efter --since — ingen gammel/intern opgave er blevet synlig`, odd.length === 0, `${odd.length} afvigende`])
    if (stage === 'old') {
      let a = 'ok', b = 'ok'
      try { await run(`SELECT id, customer_id, title, description, due_date, status, created_at, auto_rule FROM public.customer_tasks WHERE title ILIKE '%esigtigelse%' ORDER BY due_date LIMIT 50`) } catch (e) { a = (e as { code?: string }).code ?? 'fejl' }
      try { await run(`SELECT t.id, t.customer_id, t.title, t.description, t.created_at, t.due_date, t.status, t.auto_rule FROM public.customer_tasks t WHERE t.title ILIKE '%esigtigelse%' AND t.status = 'pending' LIMIT 50`) } catch (e) { b = (e as { code?: string }).code ?? 'fejl' }
      res.push(['tilstand A: den gamle kodes portal- og rykker-forespørgsler virker på det nye skema', a === 'ok' && b === 'ok', `${a}/${b}`])
    } else {
      let q = 'ok'
      try { await run(`SELECT ${PORTAL_TASK_COLUMNS} FROM public.customer_tasks WHERE customer_visible = true AND title ILIKE '%esigtigelse%' LIMIT 50`) } catch (e) { q = (e as { code?: string }).code ?? 'fejl' }
      res.push(['tilstand B: den nye kodes portal-opgaveforespørgsel virker', q === 'ok', q])
    }
    // tilbudsprojektion (ny kode) — read-only på rigtige portal-tilbud; kun antal ud
    const offers = await run(`SELECT ${PORTAL_OFFER_COLUMNS} FROM public.offers WHERE status IN ('sent','viewed','accepted','rejected')`)
    const ids = offers.map((o) => `'${String(o.id).replace(/[^0-9a-f-]/gi, '')}'`).join(',')
    const lines = offers.length ? await run(`SELECT ${PORTAL_LINE_ITEM_COLUMNS} FROM public.offer_line_items WHERE offer_id IN (${ids})`) : []
    const dto = offers.map(({ created_by: _c, ...o }) => ({ ...o, line_items: lines.filter((l) => l.offer_id === o.id) }))
    const forb = findForbiddenPortalKeys(dto)
    res.push([`tilbudsprojektion: ${offers.length} portal-tilbud / ${lines.length} linjer uden kost/margin/noter/medarbejderfelter; salgspris/total/rabat med`, forb.length === 0 && lines.every((l) => 'unit_price' in l && 'total' in l && 'discount_percentage' in l) && offers.every((o) => 'final_amount' in o && 'tax_amount' in o), forb.slice(0, 3).join(',')])
    // rykker (ny kode): udvælgelse + intet sendt siden --since
    const rem = await run(`SELECT id, title, auto_rule, status, due_date, customer_visible FROM public.customer_tasks WHERE customer_visible = true AND title ILIKE '%esigtigelse%' AND status = 'pending'`)
    const remindable = rem.filter((t) => shouldRemindBesigtigelse(t))
    // rykker-cron'en kan KUN maile disse (offer-reminders: .eq('customer_visible', true) + shouldRemindBesigtigelse); lige
    // efter deploy er tallet 0, senere kun ægte bookinger hvor kunden allerede har fået bekræftelse
    const oddR = remindable.filter((t) => !t.customer_visible)
    res.push([`rykker: ${remindable.length} kandidater, alle kundesynlige bookinger (intet sendes af smoke-testen)`, oddR.length === 0, `${oddR.length} afvigende`])
  })
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
