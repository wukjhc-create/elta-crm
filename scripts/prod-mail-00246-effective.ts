/**
 * PRODUCTION effektiv kontrol af 00246 (incoming_emails SELECT) — ROLLBACK-ONLY (prod-rollback-probe.ts). Rigtige
 * profiler; prøvemails, en prøvefaktura, overrides, rolleskift og inaktivering oprettes INDE i transaktionen og rulles
 * tilbage — intet committes, intet består.
 *   Fixtures: own (kunde i montørens scope), hidden (fremmed kunde), unlinked, invoice (ukoblet faktura-kilde),
 *   case_own (sag i montørens scope, uden kunde), case_hidden (fremmed sag, uden kunde)
 *   Pr. rolle (nul overrides) + rigtige mails: antal synlige af prods egne mails pr. kategori
 *   Per-medarbejder: grants/revokes, inaktiv, manglende profil, anon
 *   npx tsx scripts/prod-mail-00246-effective.ts
 * Prod har kun aktive admin/montør → serviceleder/salg/bogholderi prøves ved at sætte rollen på montør-profilen i
 * transaktionen (som 00245). Kun PASS/FAIL + antal/fejlkoder ud — ingen id'er, navne eller indhold.
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'

const L = ['own', 'hidden', 'unlinked', 'invoice', 'case_own', 'case_hidden'] as const
type Label = (typeof L)[number]
const ALL = [...L].sort().join(',')
const NO_UNLINKED = 'case_hidden,case_own,hidden,invoice,own'

runMain(() => withProdRollbackProbe('mail-00246-effective', async ({ q, as, add, notTestable }) => {
  const pol = (await q(`SELECT coalesce(qual,'') q FROM pg_policies WHERE schemaname='public' AND tablename='incoming_emails' AND cmd='SELECT'`)) as Array<{ q: string }>
  add('NY', 'SELECT-politikken er 00246 (ingen user_role())', pol.length === 1 && pol[0].q.includes("'incoming_invoices.view'") && !/user_role\(\)/.test(pol[0].q), `${pol.length} politik`)

  const adm = ((await q(`SELECT id FROM profiles WHERE is_active AND role='admin' ORDER BY created_at LIMIT 1`)) as any[])[0]?.id as string | undefined
  // den aktive montør med flest sager i scope (prod: én har 3)
  let montor: string | undefined, best = -1
  for (const m of (await q(`SELECT id FROM profiles WHERE is_active AND role='montør' ORDER BY created_at`)) as Array<{ id: string }>) {
    const r = await as({ uid: m.id }, `SELECT cardinality(public.my_case_scope_ids()) k`)
    if (r.ok && r.rows[0].k > best) { best = r.rows[0].k; montor = m.id }
  }
  if (!adm || !montor) throw new Error('kræver aktiv admin og montør i prod')
  const custScope = await as({ uid: montor }, `SELECT unnest(public.my_customer_scope_ids()) id`)
  const caseScope = await as({ uid: montor }, `SELECT unnest(public.my_case_scope_ids()) id`)
  const cs = new Set(custScope.ok ? custScope.rows.map((x) => x.id as string) : [])
  const ks = new Set(caseScope.ok ? caseScope.rows.map((x) => x.id as string) : [])
  const custs = (await q(`SELECT id FROM customers ORDER BY id`)) as Array<{ id: string }>
  const cases = (await q(`SELECT id FROM service_cases ORDER BY id`)) as Array<{ id: string }>
  const fx = {
    own: [...cs][0], hidden: custs.find((c) => !cs.has(c.id))?.id,
    caseOwn: [...ks][0], caseHidden: cases.find((c) => !ks.has(c.id))?.id,
  }
  if (!fx.own || !fx.hidden || !fx.caseOwn || !fx.caseHidden) throw new Error(`fixtures mangler: ${Object.entries(fx).filter(([, v]) => !v).map(([k]) => k).join(',')}`)

  const id = Object.fromEntries(L.map((l) => [l, randomUUID()])) as Record<Label, string>
  const label = new Map(Object.entries(id).map(([k, v]) => [v, k]))
  const mail = (l: Label, cust: string | null, kase: string | null) =>
    `('${id[l]}', 'probe-246-${id[l]}', '[PROBE 246]', 'probe-246@elta-crm.local', ${cust ? `'${cust}'` : 'NULL'}, ${kase ? `'${kase}'` : 'NULL'}, now())`
  const seed = [
    `INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, customer_id, service_case_id, received_at) VALUES
      ${mail('own', fx.own, null)}, ${mail('hidden', fx.hidden, null)}, ${mail('unlinked', null, null)}, ${mail('invoice', null, null)},
      ${mail('case_own', null, fx.caseOwn)}, ${mail('case_hidden', null, fx.caseHidden)}`,
    `INSERT INTO public.incoming_invoices (source, source_email_id) VALUES ('email', '${id.invoice}')`,
  ]
  const ov = (uid: string, rows: Array<[string, 'grant' | 'revoke']>) =>
    `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map(([k, e]) => `('${uid}', '${k}', '${e}', 'manual', 'rollback-prøve 00246')`).join(',')}`
  const asRole = (role: string) => `UPDATE public.profiles SET role = '${role}' WHERE id = '${montor}'`
  const ids = Object.values(id).map((x) => `'${x}'`).join(',')

  const see = async (who: { uid: string } | 'anon', setup: string[] = []) => {
    const r = await as(who, `SELECT id FROM public.incoming_emails WHERE id IN (${ids})`, [], [...seed, ...setup])
    return r.ok ? r.rows.map((x) => label.get(x.id) ?? '?').sort().join(',') : r.code
  }
  const expect = async (name: string, who: { uid: string } | 'anon', setup: string[], want: string) => {
    const got = await see(who, setup)
    add('NY', `${name}: [${want || '—'}]`, got === want, got === want ? '' : `fik [${got || '—'}]`)
  }

  // ---- standardroller
  await expect('admin', { uid: adm }, [], ALL)
  await expect('serviceleder (rolle på montør-profil)', { uid: montor }, [asRole('serviceleder')], ALL)
  await expect('salg (rolle på montør-profil)', { uid: montor }, [asRole('salg')], ALL)
  await expect('bogholderi (rolle på montør-profil) — ingen ukoblede', { uid: montor }, [asRole('bogholderi')], NO_UNLINKED)
  await expect('montør — kun sag i eget scope', { uid: montor }, [], 'case_own')
  // ---- per-medarbejder
  await expect('montør + customers.emails.view', { uid: montor }, [ov(montor, [['customers.emails.view', 'grant']])], 'case_own,own')
  await expect('montør + customers.view.all (uden mail-nøgle)', { uid: montor }, [ov(montor, [['customers.view.all', 'grant']])], 'case_own')
  await expect('montør + emails.view + view.all + edit', { uid: montor }, [ov(montor, [['customers.emails.view', 'grant'], ['customers.view.all', 'grant'], ['customers.edit', 'grant']])], ALL)
  await expect('montør + inbox.view', { uid: montor }, [ov(montor, [['inbox.view', 'grant']])], ALL)
  await expect('salg − customers.edit', { uid: montor }, [asRole('salg'), ov(montor, [['customers.edit', 'revoke']])], 'case_own,hidden,own')
  await expect('salg − customers.emails.view', { uid: montor }, [asRole('salg'), ov(montor, [['customers.emails.view', 'revoke']])], 'case_own')
  await expect('bogholderi + inbox.view', { uid: montor }, [asRole('bogholderi'), ov(montor, [['inbox.view', 'grant']])], ALL)
  await expect('bogholderi − customers.emails.view', { uid: montor }, [asRole('bogholderi'), ov(montor, [['customers.emails.view', 'revoke']])], 'case_hidden,case_own,invoice')
  await expect('bogholderi − incoming_invoices.view', { uid: montor }, [asRole('bogholderi'), ov(montor, [['incoming_invoices.view', 'revoke']])], 'case_hidden,case_own,hidden,own')
  await expect('serviceleder − inbox.view (andre nøgler giver stadig adgang)', { uid: montor }, [asRole('serviceleder'), ov(montor, [['inbox.view', 'revoke']])], ALL)
  await expect('serviceleder − inbox.view − customers.emails.view', { uid: montor }, [asRole('serviceleder'), ov(montor, [['inbox.view', 'revoke'], ['customers.emails.view', 'revoke']])], 'case_hidden,case_own,invoice')
  await expect('admin − inbox.view − customers.emails.view', { uid: adm }, [ov(adm, [['inbox.view', 'revoke'], ['customers.emails.view', 'revoke']])], 'case_hidden,case_own,invoice')
  await expect('inaktiv profil (montør + inbox.view-grant, is_active=false)', { uid: montor }, [ov(montor, [['inbox.view', 'grant']]), `UPDATE public.profiles SET is_active = false WHERE id = '${montor}'`], '')
  await expect('manglende profil', { uid: randomUUID() }, [], '')
  const anon = await see('anon')
  add('NY', 'anon: intet', anon === '' || anon === '42501', anon || '0 rækker')

  // ---- prods egne mails (uden fixtures): antal pr. rolle
  const total = Number(((await q(`SELECT count(*) n FROM incoming_emails`)) as any[])[0].n)
  const unlinkedOnly = Number(((await q(`SELECT count(*) n FROM incoming_emails e WHERE customer_id IS NULL AND service_case_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM incoming_invoices ii WHERE ii.source_email_id = e.id)`)) as any[])[0].n)
  const caseInScope = Number(((await q(`SELECT count(*) n FROM incoming_emails WHERE service_case_id = ANY($1::uuid[])`, [[...ks]])) as any[])[0].n)
  const cnt = async (who: { uid: string }, setup: string[] = []) => {
    const r = await as(who, `SELECT count(*)::int n FROM public.incoming_emails`, [], setup)
    return r.ok ? r.rows[0].n : r.code
  }
  const real: Array<[string, { uid: string }, string[], number]> = [
    ['admin', { uid: adm }, [], total],
    ['serviceleder', { uid: montor }, [asRole('serviceleder')], total],
    ['salg', { uid: montor }, [asRole('salg')], total],
    ['bogholderi (alle minus ukoblede uden sag/faktura)', { uid: montor }, [asRole('bogholderi')], total - unlinkedOnly],
    ['montør (mails på sager i scope)', { uid: montor }, [], caseInScope],
  ]
  for (const [name, who, setup, want] of real) {
    const got = await cnt(who, setup)
    add('NY', `rigtige mails — ${name}: ${want}/${total}`, got === want, got === want ? '' : `fik ${got}`)
  }
  if (caseInScope === 0) notTestable('montør mails på egne sager (rigtige data)', 'prod har ingen sags-koblede mails — dækket af fixture case_own')
}))
