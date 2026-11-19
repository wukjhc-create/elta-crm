/**
 * Stage A — PRODUCTION-SIMULATOR, ROLLBACK-ONLY (prod-rollback-probe.ts: ÉN transaktion, ALTID ROLLBACK, COMMIT forbudt).
 * "Hvad ville der ske, hvis Stage A var slået til?" — kører den RIGTIGE indtagskode (ingestEmailSource →
 * receptionBackgroundIngest → reception_ingest) mod rigtige prod-mails, men via en lille læse-shim over transaktionens
 * forbindelse; reception_ingest kaldes som service_role i transaktionen, og ALT rulles tilbage. Intet består, intet sendes
 * (Stage A kan ikke sende — se stage-a-email-ingest-test). Kun antal/kategorier ud — ingen navne, adresser eller indhold.
 *   npx tsx scripts/prod-stage-a-simulate.ts [--days 7]
 * Simuleret aktivering = nu − days (dvs. som om Stage A var slået til for `days` dage siden). AI-klassifikation er FRA
 * (som standard; deterministisk motor).
 */
import type { Client } from 'pg'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'

const days = (() => { const i = process.argv.indexOf('--days'); const n = i > 0 ? Number(process.argv[i + 1]) : 7; return Number.isFinite(n) && n > 0 && n <= 14 ? n : 7 })()
const COL = /^[a-z_][a-z0-9_]*$/

/** Minimal supabase-lignende læse-klient over pg (kun de former indtagsvejen bruger) + rpc('reception_ingest') */
function pgShim(q0: (sql: string, params?: unknown[]) => Promise<any[]>) {
  // serialisér: motoren læser parallelt (Promise.all), men savepoints på én forbindelse må ikke flettes
  let chain: Promise<unknown> = Promise.resolve()
  const lock = <T,>(f: () => Promise<T>): Promise<T> => { const r = chain.then(f, f); chain = r.catch(() => {}); return r }
  const q = q0
  return {
    from(table: string) {
      if (!COL.test(table)) throw new Error('ugyldig tabel')
      let cols = '*'; const where: string[] = []; const params: unknown[] = []; const order: string[] = []; let lim: number | null = null; let off = 0
      const p = (v: unknown) => { params.push(v); return `$${params.length}` }
      const c = (x: string) => { if (!COL.test(x)) throw new Error(`ugyldig kolonne ${x}`); return `"${x}"` }
      const run = () => lock(async () => {
        try {
          const sql = `SELECT ${cols} FROM public."${table}"${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${order.length ? ` ORDER BY ${order.join(', ')}` : ''}${lim !== null ? ` LIMIT ${lim}` : ''}${off ? ` OFFSET ${off}` : ''}`
          await q('SAVEPOINT shim')
          try { const rows = await q(sql, params); await q('RELEASE SAVEPOINT shim'); return { data: rows, error: null } }
          catch (e) { await q('ROLLBACK TO SAVEPOINT shim'); return { data: null, error: { code: (e as { code?: string }).code ?? 'fejl', message: 'read failed' } } }
        } catch (e) { return { data: null, error: { code: 'fejl', message: String((e as Error).message) } } }
      })
      const b: any = {
        select(s: string) { const list = String(s).split(',').map((x) => x.trim()).filter(Boolean); cols = list.map(c).join(', '); return b },
        eq(k: string, v: unknown) { where.push(`${c(k)} = ${p(v)}`); return b },
        ilike(k: string, v: unknown) { where.push(`${c(k)} ILIKE ${p(v)}`); return b },
        in(k: string, v: unknown[]) { where.push(`${c(k)}::text = ANY(${p((v ?? []).map(String))}::text[])`); return b },
        not(k: string, op: string, v: unknown) {
          if (op === 'is' && v === null) where.push(`${c(k)} IS NOT NULL`)
          else if (op === 'in') where.push(`NOT (${c(k)}::text = ANY(${p(String(v).replace(/^\(|\)$/g, '').split(',').map((x) => x.trim()))}::text[]))`)
          else throw new Error(`shim: not(${op}) ikke understøttet`)
          return b
        },
        or(expr: string) {
          const parts = expr.split(',').map((x) => x.trim()).map((x) => { const m = x.match(/^([a-z_]+)\.not\.is\.null$/); if (!m) throw new Error(`shim: or(${x}) ikke understøttet`); return `${c(m[1])} IS NOT NULL` })
          where.push(`(${parts.join(' OR ')})`); return b
        },
        order(k: string, o?: { ascending?: boolean }) { order.push(`${c(k)} ${o?.ascending === false ? 'DESC' : 'ASC'}`); return b },
        range(a: number, z: number) { off = a; lim = z - a + 1; return b },
        limit(n: number) { lim = n; return b },
        async maybeSingle() { const r = await run(); return r.error ? r : { data: (r.data ?? [])[0] ?? null, error: null } },
        async single() { const r = await run(); return r.error ? r : (r.data ?? []).length === 1 ? { data: r.data![0], error: null } : { data: null, error: { code: 'PGRST116' } } },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej) },
      }
      return b
    },
    rpc(fn: string, args: { p: Record<string, unknown> }) { return lock(() => this.rpc0(fn, args)) },
    async rpc0(fn: string, args: { p: Record<string, unknown> }) {
      if (fn !== 'reception_ingest') throw new Error('kun reception_ingest')
      await q('SAVEPOINT ing')
      try {
        await q(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`)
        await q('SET LOCAL ROLE service_role')
        const r = (await q('SELECT public.reception_ingest($1::jsonb) AS r', [JSON.stringify(args.p)]))[0].r
        await q('RESET ROLE'); await q('RELEASE SAVEPOINT ing')
        return { data: r, error: null }
      } catch (e) {
        await q('ROLLBACK TO SAVEPOINT ing'); await q('RESET ROLE').catch(() => {})
        return { data: null, error: { code: (e as { code?: string }).code ?? 'fejl' } }
      }
    },
  }
}

runMain(() => withProdRollbackProbe('stage-a-simulate', async ({ q, add }) => {
  void (null as unknown as Client)
  const { ingestEmailSource } = await import('../src/lib/reception/channel-intake')
  const { backgroundCapability } = await import('../src/lib/reception/background-actor')
  const now = Date.now()
  const since = new Date(now - days * 86_400_000).toISOString()
  const env = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: since }
  const cap = backgroundCapability(pgShim(q) as never)
  // eksisterende henvendelser (baseline) — fingeraftryk før
  const fpSql = `SELECT count(*)::int n, md5(coalesce(string_agg((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text, '|' ORDER BY x.id), '')) m FROM public.conversations x`
  const fp0 = (await q(fpSql))[0]
  const items0 = (await q(`SELECT count(*)::int n FROM public.conversation_items`))[0].n
  const actFp = `SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) m FROM public.conversation_actions x`
  const act0 = (await q(actFp))[0].m
  const existingIds = new Set((await q(`SELECT id FROM public.conversations`)).map((r) => r.id as string))
  // kandidater: alle mails opdaget i vinduet, ældste først (som mail-sync'en ville have set dem)
  const mails = await q(`SELECT id FROM public.incoming_emails WHERE created_at >= $1 ORDER BY created_at ASC, id ASC`, [since])
  const outcomes: Record<string, number> = {}
  const convs = new Set<string>()
  const dupOfExisting = { n: 0 }
  for (const m of mails) {
    const r = await ingestEmailSource(m.id as string, { env, capability: cap, now: () => now })
    const k = r.outcome === 'skipped' ? `skipped:${r.reason}` : r.outcome
    outcomes[k] = (outcomes[k] ?? 0) + 1
    // kun created/appended ændrer en henvendelse; duplicate = mailen er allerede kilde i en eksisterende (ingen ændring)
    if (r.conversationId && (r.outcome === 'created' || r.outcome === 'appended')) convs.add(r.conversationId)
    if (r.outcome === 'duplicate' && r.conversationId && existingIds.has(r.conversationId)) dupOfExisting.n++
  }
  console.log(`INFO  heraf allerede kilde i en af de eksisterende henvendelser (duplicate, uændret): ${dupOfExisting.n}`)
  // dubletkørsel (samme sync to gange): alt der blev indtaget skal give duplicate
  let dupOk = 0, dupTotal = 0
  for (const m of mails) {
    const has = (await q(`SELECT 1 FROM public.conversation_items WHERE source_table = 'incoming_emails' AND source_id = $1`, [m.id])).length
    if (!has) continue
    dupTotal++
    const r = await ingestEmailSource(m.id as string, { env, capability: cap, now: () => now })
    if (r.outcome === 'duplicate') dupOk++
  }
  const newConvs = [...convs].filter((id) => !existingIds.has(id))
  const touchedExisting = [...convs].filter((id) => existingIds.has(id)).length
  const dist = async (col: string) => newConvs.length ? Object.fromEntries((await q(`SELECT coalesce(${col}::text, '(null)') k, count(*)::int n FROM public.conversations WHERE id = ANY($1::uuid[]) GROUP BY 1 ORDER BY 1`, [newConvs])).map((r) => [r.k, r.n])) : {}
  const acts = newConvs.length ? Object.fromEntries((await q(`SELECT action_type || ':' || state k, count(*)::int n FROM public.conversation_actions WHERE conversation_id = ANY($1::uuid[]) GROUP BY 1 ORDER BY 1`, [newConvs])).map((r) => [r.k, r.n])) : {}
  const perConvItems = newConvs.length ? (await q(`SELECT count(*)::int n FROM public.conversation_items WHERE conversation_id = ANY($1::uuid[])`, [newConvs]))[0].n : 0
  const dupItems = (await q(`SELECT count(*)::int n FROM (SELECT source_id FROM public.conversation_items WHERE source_table = 'incoming_emails' GROUP BY source_id HAVING count(*) > 1) d`))[0].n
  console.log(`INFO  simuleret aktivering: nu − ${days} døgn · mails opdaget i vinduet: ${mails.length}`)
  console.log(`INFO  udfald pr. mail: ${JSON.stringify(outcomes)}`)
  console.log(`INFO  nye henvendelser: ${newConvs.length} (items i dem: ${perConvItems})`)
  console.log(`INFO  kanal: ${JSON.stringify(await dist('channel'))}`)
  console.log(`INFO  kunde-match: ${JSON.stringify(await dist('customer_match_state'))}`)
  console.log(`INFO  bekræftet kunde: ${JSON.stringify(await dist("CASE WHEN customer_id IS NOT NULL THEN 'bekræftet' WHEN customer_candidate_id IS NOT NULL THEN 'kandidat' ELSE 'ingen' END"))}`)
  console.log(`INFO  sags-match: ${JSON.stringify(await dist('case_match_state'))}`)
  console.log(`INFO  hastegrad: ${JSON.stringify(await dist('urgency'))} · status: ${JSON.stringify(await dist('status'))}`)
  console.log(`INFO  foreslåede handlinger (type:tilstand): ${JSON.stringify(acts)}`)
  add('NY', 'ingen fejl/læsefejl i indtaget for rigtige prod-mails', !Object.keys(outcomes).some((k) => ['error', 'read_error', 'not_found'].includes(k)), JSON.stringify(outcomes))
  add('NY', 'ingen handling udført/godkendt (kun forslag/blokeret)', Object.keys(acts).every((k) => /:(proposed|blocked)$/.test(k)), '')
  add('NY', 'de eksisterende henvendelser røres ikke (ingen føjet til; baseline-fingeraftryk efter = før)', touchedExisting === 0 && (await q(`SELECT count(*)::int n, md5(coalesce(string_agg((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text, '|' ORDER BY x.id), '')) m FROM public.conversations x WHERE id = ANY($1::uuid[])`, [[...existingIds]]))[0].m === fp0.m, `rørt: ${touchedExisting}`)
  add('NY', 'eksisterende forslags-handlinger uændrede', (await q(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) m FROM public.conversation_actions x WHERE conversation_id = ANY($1::uuid[])`, [[...existingIds]]))[0].m === act0, '')
  add('NY', 'præcis ét item pr. kanonisk mail', dupItems === 0, `${dupItems}`)
  add('NY', `samme kørsel igen → alle indtagne mails giver duplicate (${dupOk}/${dupTotal})`, dupOk === dupTotal, '')
  void items0
}))
