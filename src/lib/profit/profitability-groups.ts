/**
 * Ledelsesoverblik (fokus D 2026-10-15): realiseret DB pr. kunde og pr. måned ud fra efterkalkulationens sagsrækker.
 * Rene funktioner. Kun sager med udstedt faktura (realiseret DB ≠ null) tæller i DB; måned = sagens lukkedato
 * (Europe/Copenhagen), så en måned viser de sager der blev afsluttet i den.
 * 00248: en faktureret sag med ukendt kost tæller i sager og faktureret, men gruppens DB bliver ukendt. Den må ikke
 * forsvinde stille og heller ikke tælle som 0.
 */

export interface GroupInputRow {
  customer_id: string | null
  customer_name: string | null
  status: string
  closed_at: string | null
  net_invoiced: number
  realized_db: number | null
  realized_incomplete?: boolean
}

export interface ProfitGroup {
  key: string
  label: string
  cases: number
  net_invoiced: number
  /** Null, hvis en sag i gruppen mangler kost */
  realized_db: number | null
  realized_db_pct: number | null
  /** Sager i gruppen, hvor DB er ukendt */
  incomplete_cases: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

function finish(m: Map<string, ProfitGroup>): ProfitGroup[] {
  return [...m.values()].map((g) => {
    const db = g.incomplete_cases > 0 || g.realized_db == null ? null : r2(g.realized_db)
    return { ...g, net_invoiced: r2(g.net_invoiced), realized_db: db, realized_db_pct: db != null && g.net_invoiced > 0 ? Math.round((db / g.net_invoiced) * 1000) / 10 : null }
  })
}

function add(m: Map<string, ProfitGroup>, key: string, label: string, r: GroupInputRow) {
  const g = m.get(key) ?? { key, label, cases: 0, net_invoiced: 0, realized_db: 0, realized_db_pct: null, incomplete_cases: 0 }
  g.cases++
  g.net_invoiced += r.net_invoiced
  if (r.realized_incomplete) g.incomplete_cases++
  else g.realized_db = (g.realized_db ?? 0) + (r.realized_db ?? 0)
  m.set(key, g)
}

export function profitByCustomer(rows: GroupInputRow[]): ProfitGroup[] {
  const m = new Map<string, ProfitGroup>()
  for (const r of rows) if (r.realized_db != null || r.realized_incomplete) add(m, r.customer_id ?? 'ukendt', r.customer_name ?? 'Ukendt kunde', r)
  return finish(m).sort((a, b) => (b.realized_db ?? Number.NEGATIVE_INFINITY) - (a.realized_db ?? Number.NEGATIVE_INFINITY))
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function monthKeyCph(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}`
}

export function profitByClosedMonth(rows: GroupInputRow[]): ProfitGroup[] {
  const m = new Map<string, ProfitGroup>()
  for (const r of rows) {
    if (r.status !== 'closed' || !r.closed_at || (r.realized_db == null && !r.realized_incomplete)) continue
    const k = monthKeyCph(r.closed_at)
    add(m, k, `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`, r)
  }
  return finish(m).sort((a, b) => b.key.localeCompare(a.key))
}
