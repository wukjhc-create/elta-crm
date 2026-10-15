/**
 * Aftaler på kalenderens dag og uge.
 *
 * Månedsvisningen grupperer besigtigelser, assistent-opkald og egne påmindelser
 * på dansk dato. Dag og uge viste kun arbejdsordrer. Denne funktion bruger
 * samme datoregel (copenhagenParts), så et opkald kl. 00:30 dansk tid ikke
 * lander på dagen før.
 *
 * Ingen I/O. Ingen telefon, mail eller adresse — kun det kalenderen skal vise.
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export type AgendaKind = 'inspection' | 'callback' | 'reminder'

export interface AgendaSource {
  id: string
  title: string
  /** due_date eller due_at. Dato uden klokkeslæt (`YYYY-MM-DD`) har intet tidspunkt. */
  at: string | null
  status: string
  kind: AgendaKind
  description?: string | null
  customerId?: string | null
  customerName?: string | null
}

export interface AgendaItem {
  id: string
  title: string
  kind: AgendaKind
  status: string
  /** Dansk klokkeslæt, eller teksten fra opgavens "Tidspunkt:"/"kl.". Null når der kun er en dato. */
  clock: string | null
  customerId: string | null
  customerName: string | null
}

export interface AgendaDay {
  date: string
  items: AgendaItem[]
}

const KIND_RANK: Record<AgendaKind, number> = { inspection: 0, callback: 1, reminder: 2 }

/** Minutter siden midnat. Tekst uden tt:mm ligger efter tidsstemplede aftaler. Uden tid til sidst. */
function sortMinutes(clock: string | null): number {
  if (!clock) return 24 * 60 + 1
  const match = clock.match(/^(\d{1,2})[:.](\d{2})$/)
  if (!match) return 24 * 60
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return 24 * 60
  return hours * 60 + minutes
}

/** Tidspunkt fra beskrivelsen vinder. Ellers dansk klokkeslæt når værdien har et tidspunkt. */
export function agendaClock(at: string, description?: string | null): string | null {
  if (description) {
    const labeled = description.match(/Tidspunkt:\s*([^\n]+)/i)
    const spoken = description.match(/\bkl\.\s*(\d{1,2}[:.]\d{2})/i)
    const text = (labeled?.[1] ?? spoken?.[1])?.trim()
    if (text) return text.slice(0, 40)
  }
  if (!at.includes('T')) return null
  return copenhagenParts(at).clock
}

/**
 * Én række pr. ønsket dato, også når dagen er tom.
 * Samme id to gange: besigtigelse vinder over opkald, opkald over påmindelse.
 * Sortering: klokkeslæt, derefter titel. Uden klokkeslæt til sidst.
 */
export function agendaForDates(sources: readonly AgendaSource[], dates: readonly string[]): AgendaDay[] {
  const wanted = new Set(dates)
  const byDate = new Map<string, Map<string, AgendaSource>>()

  for (const source of sources) {
    if (!source.at || !source.id) continue
    const date = copenhagenParts(source.at).date
    if (!wanted.has(date)) continue
    const day = byDate.get(date) ?? new Map<string, AgendaSource>()
    const prev = day.get(source.id)
    if (!prev || KIND_RANK[source.kind] < KIND_RANK[prev.kind]) day.set(source.id, source)
    byDate.set(date, day)
  }

  return dates.map((date) => {
    const items = [...(byDate.get(date)?.values() ?? [])]
    items.sort((a, b) => {
      const ac = sortMinutes(agendaClock(a.at!, a.description))
      const bc = sortMinutes(agendaClock(b.at!, b.description))
      if (ac !== bc) return ac - bc
      return a.title.localeCompare(b.title, 'da')
    })
    return {
      date,
      items: items.map((source) => ({
        id: source.id,
        title: source.title,
        kind: source.kind,
        status: source.status,
        clock: agendaClock(source.at!, source.description),
        customerId: source.customerId ?? null,
        customerName: source.customerName ?? null,
      })),
    }
  })
}

/** Kommende besigtigelser efter dansk dato. Samme regel som tælleren. */
export function upcomingInspections<T extends { due_date: string | null; status: string }>(
  tasks: readonly T[],
  today: string,
): T[] {
  return tasks
    .filter((t) => Boolean(t.due_date) && copenhagenParts(t.due_date as string).date >= today && t.status !== 'done')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
}
