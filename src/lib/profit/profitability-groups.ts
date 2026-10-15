/**
 * Ledelsesoverblik (fokus D 2026-10-15): realiseret DB pr. kunde og pr. måned ud fra efterkalkulationens sagsrækker.
 * Rene funktioner. Kun sager med udstedt faktura (realiseret DB ≠ null) tæller i DB; måned = sagens lukkedato
 * (Europe/Copenhagen), så en måned viser de sager der blev afsluttet i den.
 */

export interface GroupInputRow {
  customer_id: string | null
  customer_name: string | null
  status: string
  closed_at: string | null
  net_invoiced: number
  realized_db: number | null
}

export interface ProfitGroup {
  key: string
  label: string
  cases: number
  net_invoiced: number
  realized_db: number
  realized_db_pct: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

function finish(m: Map<string, ProfitGroup>): ProfitGroup[] {
  return [...m.values()].map((g) => ({ ...g, net_invoiced: r2(g.net_invoiced), realized_db: r2(g.realized_db), realized_db_pct: g.net_invoiced > 0 ? Math.round((g.realized_db / g.net_invoiced) * 1000) / 10 : null }))
}

function add(m: Map<string, ProfitGroup>, key: string, label: string, r: GroupInputRow) {
  const g = m.get(key) ?? { key, label, cases: 0, net_invoiced: 0, realized_db: 0, realized_db_pct: null }
  g.cases++
  g.net_invoiced += r.net_invoiced
  g.realized_db += r.realized_db ?? 0
  m.set(key, g)
}

export function profitByCustomer(rows: GroupInputRow[]): ProfitGroup[] {
  const m = new Map<string, ProfitGroup>()
  for (const r of rows) if (r.realized_db != null) add(m, r.customer_id ?? 'ukendt', r.customer_name ?? 'Ukendt kunde', r)
  return finish(m).sort((a, b) => b.realized_db - a.realized_db)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function monthKeyCph(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}`
}

export function profitByClosedMonth(rows: GroupInputRow[]): ProfitGroup[] {
  const m = new Map<string, ProfitGroup>()
  for (const r of rows) {
    if (r.status !== 'closed' || !r.closed_at || r.realized_db == null) continue
    const k = monthKeyCph(r.closed_at)
    add(m, k, `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`, r)
  }
  return finish(m).sort((a, b) => b.key.localeCompare(a.key))
}
