/**
 * ELTA Assistant (Telegram, T1) — fortolkning af danske tekstkommandoer. REN logik: ingen DB, intet netværk.
 *
 * Kommandoen bliver til en hensigt + et mål (kunde-/sagssøgning) + et dansk tidspunkt. Selve opslaget af kunde/sag
 * og oprettelsen i CRM sker andetsteds; CRM er source of truth. Tvetydighed gættes ALDRIG: mangler et tidspunkt,
 * eller kan teksten ikke forstås, returneres det, så brugeren bliver spurgt.
 *
 * Eksempler:
 *   "Ring til kunde Hansen i morgen kl. 10"     → callback, target "Hansen", i morgen 10:00
 *   "Mind mig om at bestille tavle fredag kl 8" → reminder, text "bestille tavle", fredag 08:00
 *   "Note til SVC-01019: kunden ønsker hvid"    → note, target "SVC-01019", text "kunden ønsker hvid"
 *   "Status på SVC-01019" / "Find Hansen"       → lookup
 *   "Besigtigelse hos Jensen d. 14/10 kl 9"     → appointment
 */
import { copenhagenParts, copenhagenDatePlusDays, copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'

export type AssistantIntent = 'callback' | 'reminder' | 'note' | 'lookup' | 'appointment' | 'help' | 'today' | 'reschedule'

export type ParsedWhen = {
  /** Dansk kalenderdato YYYY-MM-DD */
  date: string
  /** HH:MM (dansk tid) eller null, når kun en dag er nævnt */
  clock: string | null
  /** UTC-ISO for date+clock (kun når clock findes) */
  iso: string | null
}

export type ParsedCommand =
  | {
      ok: true
      intent: AssistantIntent
      target: string | null
      text: string | null
      when: ParsedWhen | null
      /** kun reschedule: hvad der flyttes ('task' = kundeopgave/opkald/aftale, 'personal' = personlig påmindelse) */
      moveKind?: 'task' | 'personal'
    }
  | { ok: false; reason: string }

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

const z = (n: number) => String(n).padStart(2, '0')

/** Ugedag (0=søndag) for en dansk kalenderdato */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Find og fjern et tidsudtryk i teksten. Returnerer resten af teksten og tidspunktet (eller null).
 * Understøtter: i dag / i morgen / i overmorgen, (på) <ugedag> (næste forekomst; i dag → om en uge),
 * d. 14/10, 14.10, 14/10-2026, "om N timer/minutter", og klokkeslæt "kl. 10", "kl 10:30", "kl. 9.15".
 */
export function extractWhen(input: string, now: Date = new Date()): { rest: string; when: ParsedWhen | null; error?: string } {
  let text = ` ${input} `
  const today = copenhagenParts(now).date
  let date: string | null = null
  let clock: string | null = null

  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = text.match(re)
    if (m) text = text.replace(m[0], ' ')
    return m
  }

  // "om N timer/minutter" — relativt til nu, giver både dato og klokkeslæt
  const rel = take(/\bom\s+(\d{1,3}|en|et|to|tre)\s+(time|timer|minut|minutter|min)\b/i)
  if (rel) {
    const words: Record<string, number> = { en: 1, et: 1, to: 2, tre: 3 }
    const n = words[rel[1].toLowerCase()] ?? Number(rel[1])
    const ms = /^min/i.test(rel[2]) ? n * 60_000 : n * 3_600_000
    const p = copenhagenParts(new Date(now.getTime() + ms))
    date = p.date
    clock = p.clock
  }

  if (!date) {
    if (take(/\bi\s+overmorgen\b/i)) date = copenhagenDatePlusDays(2, now)
    else if (take(/\bi\s+morgen\b/i)) date = copenhagenDatePlusDays(1, now)
    else if (take(/\bi\s+dag\b/i)) date = today
  }
  if (!date) {
    const wd = take(new RegExp(`\\b(?:på\\s+|paa\\s+|næste\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i'))
    if (wd) {
      const target = WEEKDAYS.indexOf(wd[1].toLowerCase())
      let diff = (target - weekdayOf(today) + 7) % 7
      if (diff === 0) diff = 7
      date = copenhagenDatePlusDays(diff, now)
    }
  }
  if (!date) {
    // d. 14/10, 14.10, 14/10-2026, 14/10/2026 — kræver "d." eller skråstreg for ikke at forveksle med klokkeslæt
    const dmMatch = text.match(/(?:\bd\.\s*|\bden\s+)?\b(\d{1,2})[/.](\d{1,2})(?:[-/.](\d{4}))?\b(?![:.]?\d)/i)
    // kun en dato med "d."/"den" eller skråstreg — "10.30" uden præfiks er et klokkeslæt og røres ikke
    const dm = dmMatch && (dmMatch[0].includes('/') || /^(d\.|den)/i.test(dmMatch[0].trim())) ? dmMatch : null
    if (dm) {
      text = text.replace(dm[0], ' ')
      const day = Number(dm[1])
      const month = Number(dm[2])
      if (month < 1 || month > 12 || day < 1 || day > 31) return { rest: input, when: null, error: 'Ugyldig dato' }
      let year = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4))
      let cand = `${year}-${z(month)}-${z(day)}`
      if (!dm[3] && cand < today) { year += 1; cand = `${year}-${z(month)}-${z(day)}` }
      const check = new Date(Date.UTC(year, month - 1, day))
      if (check.getUTCMonth() !== month - 1) return { rest: input, when: null, error: 'Ugyldig dato' }
      date = cand
    }
  }

  if (!clock) {
    const kl = take(/\bkl\.?\s*(\d{1,2})(?:[:.](\d{2}))?\b/i)
    if (kl) {
      const h = Number(kl[1])
      const mi = kl[2] ? Number(kl[2]) : 0
      if (h > 23 || mi > 59) return { rest: input, when: null, error: 'Ugyldigt klokkeslæt' }
      clock = `${z(h)}:${z(mi)}`
    }
  }

  if (clock && !date) date = today
  const rest = text.replace(/\s+/g, ' ').trim()
  if (!date) return { rest, when: null }
  return { rest, when: { date, clock, iso: clock ? copenhagenLocalToIso(date, clock) : null } }
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/^[\s:,.-]+|[\s:,.-]+$/g, '').replace(/\s+/g, ' ').trim()
  return t.length ? t : null
}

/** Fortolk én tekstkommando. `now` kan injiceres (tests). */
export function parseAssistantCommand(input: string, now: Date = new Date()): ParsedCommand {
  const raw = (input ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return { ok: false, reason: 'Tom besked' }
  if (raw.length > 500) return { ok: false, reason: 'Beskeden er for lang' }

  // Hjælp / dagens overblik (ingen mål eller tid)
  if (/^\/?(hjælp|hjaelp|help|kommandoer)\??$/i.test(raw)) return { ok: true, intent: 'help', target: null, text: null, when: null }
  if (/^\/?(i ?dag|idag|today|mine opgaver( i dag)?|dagens opgaver)\??$/i.test(raw)) return { ok: true, intent: 'today', target: null, text: null, when: null }

  // Flyt: "Flyt opkaldet til Hansen til i morgen kl. 10", "Flyt påmindelsen om arbejdstøj til fredag kl 9"
  const move = raw.match(/^(?:flyt|ryk|udskyd)\s+(.+)$/i)
  if (move) {
    const { rest, when, error } = extractWhen(move[1], now)
    if (error) return { ok: false, reason: error }
    if (!when?.iso) return { ok: false, reason: 'Hvornår skal det flyttes til? (fx "til i morgen kl. 10")' }
    // sidste "til" (før tidsudtrykket) adskiller mål og tid — fjernes
    const body = rest.replace(/\s+til\s*$/i, '').trim()
    const personal = body.match(/^(?:min\s+)?påmindelse(?:n)?\s+(?:om\s+)?(?:at\s+)?(.+)$/i)
    if (personal) {
      const text = clean(personal[1])
      if (!text) return { ok: false, reason: 'Hvilken påmindelse? (fx "Flyt påmindelsen om arbejdstøj til fredag kl. 9")' }
      return { ok: true, intent: 'reschedule', target: null, text, when, moveKind: 'personal' }
    }
    const task = body.match(/^(?:opkald(?:et)?|aftale(?:n)?|besigtigelse(?:n)?|opgave(?:n)?)\s+(?:til|med|hos|for)\s+(.+)$/i)
    const target = clean((task ? task[1] : body).replace(/^(?:kunde|kunden)\s+/i, ''))
    if (!target) return { ok: false, reason: 'Hvad skal flyttes? (fx "Flyt opkaldet til Hansen til i morgen kl. 10")' }
    return { ok: true, intent: 'reschedule', target, text: null, when, moveKind: 'task' }
  }

  // Note: "Note til/på X: tekst" — teksten kan indeholde tidsord, så tidsudtræk springes over
  const note = raw.match(/^(?:skriv\s+)?note\s+(?:til|på|paa)\s+(.+?)\s*:\s*(.+)$/i)
  if (note) {
    const target = clean(note[1].replace(/^(?:kunde|sag)\s+/i, ''))
    const text = clean(note[2])
    if (!target || !text) return { ok: false, reason: 'Skriv: Note til <kunde/sag>: <tekst>' }
    return { ok: true, intent: 'note', target, text, when: null }
  }

  // Opslag: "status på X", "find X", "vis X", "slå X op"
  const look = raw.match(/^(?:status\s+(?:på|paa)|find|vis|søg(?:\s+efter)?|slå)\s+(.+?)(?:\s+op)?$/i)
  if (look) {
    const target = clean(look[1].replace(/^(?:kunde|kunden|sag|sagen)\s+/i, ''))
    if (!target) return { ok: false, reason: 'Hvem eller hvad skal jeg slå op?' }
    return { ok: true, intent: 'lookup', target, text: null, when: null }
  }

  const { rest, when, error } = extractWhen(raw, now)
  if (error) return { ok: false, reason: error }

  const call = rest.match(/^(?:ring\s+(?:til|op\s+til)?|tilbageringning\s+(?:til)?)\s*(.+)$/i)
  if (call) {
    const target = clean(call[1].replace(/^(?:kunde|kunden)\s+/i, ''))
    if (!target) return { ok: false, reason: 'Hvem skal der ringes til?' }
    if (!when?.iso) return { ok: false, reason: when ? 'Hvad tid skal der ringes? (fx "kl. 10")' : 'Hvornår skal der ringes? (fx "i morgen kl. 10")' }
    return { ok: true, intent: 'callback', target, text: null, when }
  }

  const appt = rest.match(/^(?:book\s+|opret\s+)?(besigtigelse|aftale|møde)\s+(?:hos|med|til)\s+(.+)$/i)
  if (appt) {
    const target = clean(appt[2].replace(/^(?:kunde|kunden)\s+/i, ''))
    if (!target) return { ok: false, reason: 'Hos hvem?' }
    if (!when?.iso) return { ok: false, reason: 'Hvornår? (fx "d. 14/10 kl. 9")' }
    return { ok: true, intent: 'appointment', target, text: appt[1].toLowerCase(), when }
  }

  const remind = rest.match(/^(?:mind\s+mig\s+om(?:\s+at)?|husk(?:\s+at)?)\s+(.+)$/i)
  if (remind) {
    const text = clean(remind[1])
    if (!text) return { ok: false, reason: 'Hvad skal jeg minde dig om?' }
    if (!when?.iso) return { ok: false, reason: when ? 'Hvad tid? (fx "kl. 8")' : 'Hvornår? (fx "fredag kl. 8")' }
    return { ok: true, intent: 'reminder', target: null, text, when }
  }

  return { ok: false, reason: 'Jeg forstod ikke kommandoen. Prøv fx "Ring til Hansen i morgen kl. 10"' }
}
