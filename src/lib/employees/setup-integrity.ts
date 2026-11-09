/**
 * Employee Setup Integrity (2026-11-09): ét sted der afgør, om et login har en brugbar medarbejderrække.
 *
 * Regler:
 *  - Koblingen er KUN employees.profile_id = profiles.id. Aldrig gæt på e-mail eller navn.
 *  - Præcis én AKTIV række = 'linked'. Ingen række = 'missing'. Kun inaktive rækker = 'inactive_only'.
 *    Flere aktive rækker = 'ambiguous' — der vælges INGEN (ingen stille "ældste vinder" i nye skrivestier).
 *  - Manglende sats er UKENDT (null), aldrig 0. En sats på 0 markeres for sig (mistænkelig, men en kendt værdi).
 *  - En læsefejl er en fejl (kastes), aldrig "ingen medarbejder".
 *
 * Bruges af invitation/rolleskift/kobling/aktivering (forhindrer nye inkonsistente tilstande), af planlægning og
 * tidsregistrering (klar fejl i stedet for tom liste) og af diagnostik (pilot-tjekliste, prod-employee-integrity).
 * Ingen sikkerhedsbeslutninger træffes ud fra rollen her: "kræver en medarbejder" er en opsætningsregel for montører,
 * adgang afgøres fortsat af effektive rettigheder.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type EmployeeLinkState = 'linked' | 'missing' | 'inactive_only' | 'ambiguous'

export interface EmployeeLinkRow {
  id: string
  active: boolean | null
  created_at?: string | null
  hourly_rate?: unknown
  cost_rate?: unknown
}

export interface EmployeeSetup {
  state: EmployeeLinkState
  /** Kun sat ved 'linked' — aldrig et gæt */
  employeeId: string | null
  activeEmployeeIds: string[]
  /** null = ikke vurderet (ingen entydig aktiv række eller satser ikke læst) */
  missingSaleRate: boolean | null
  missingCostRate: boolean | null
  zeroSaleRate: boolean | null
  zeroCostRate: boolean | null
}

/** En sats er kendt, hvis den er et endeligt tal (også 0). null/''/NaN = ukendt. */
export function knownRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function classifyEmployeeLink(rows: EmployeeLinkRow[], opts: { ratesRead?: boolean } = {}): EmployeeSetup {
  const active = rows.filter((r) => r.active === true)
  const base = { activeEmployeeIds: active.map((r) => r.id), missingSaleRate: null, missingCostRate: null, zeroSaleRate: null, zeroCostRate: null }
  if (active.length === 0) return { ...base, state: rows.length ? 'inactive_only' : 'missing', employeeId: null }
  if (active.length > 1) return { ...base, state: 'ambiguous', employeeId: null }
  const row = active[0]
  if (!opts.ratesRead) return { ...base, state: 'linked', employeeId: row.id }
  const sale = knownRate(row.hourly_rate)
  const cost = knownRate(row.cost_rate)
  return {
    ...base,
    state: 'linked',
    employeeId: row.id,
    missingSaleRate: sale === null,
    missingCostRate: cost === null,
    zeroSaleRate: sale === 0,
    zeroCostRate: cost === 0,
  }
}

/** Opsætningsregel (ikke adgang): montører skal have en medarbejder for at kunne få job og registrere tid. */
export function roleRequiresEmployee(role: string | null | undefined): boolean {
  return role === 'montør'
}

/** Brugerrettet tekst pr. tilstand — siger hvad der mangler og hvem der kan rette det; ingen navne/id'er. */
export const EMPLOYEE_SETUP_TEXT: Record<Exclude<EmployeeLinkState, 'linked'>, string> = {
  missing: 'Dit login er ikke koblet til en medarbejder. Bed kontoret koble dig under Medarbejdere — indtil da kan du ikke få job eller registrere tid.',
  inactive_only: 'Dit login er kun koblet til en inaktiv medarbejder. Bed kontoret genaktivere eller koble den rigtige medarbejder.',
  ambiguous: 'Dit login er koblet til flere aktive medarbejdere, så det er uklart hvilken der er din. Bed kontoret rette koblingen under Medarbejdere.',
}

/** Kort tekst til admin-lister (diagnostik). */
export const EMPLOYEE_SETUP_ISSUE: Record<Exclude<EmployeeLinkState, 'linked'>, string> = {
  missing: 'login uden medarbejderrække',
  inactive_only: 'login kun koblet til inaktiv medarbejder',
  ambiguous: 'login koblet til flere aktive medarbejdere',
}

export class EmployeeSetupReadError extends Error {
  constructor() {
    super('Kunne ikke kontrollere medarbejderopsætningen — prøv igen. Det betyder ikke, at den mangler.')
    this.name = 'EmployeeSetupReadError'
  }
}

/**
 * Alle medarbejderrækker for et login (aktive og inaktive), ældste først. Med includeRates læses satserne — kræver en
 * klient der må se dem (admin-klienten); montørens egen klient får dem ikke.
 */
export async function loadEmployeeSetup(client: SupabaseClient, profileId: string, opts: { includeRates?: boolean } = {}): Promise<EmployeeSetup> {
  const cols = opts.includeRates ? 'id, active, created_at, hourly_rate, cost_rate' : 'id, active, created_at'
  const { data, error } = await client.from('employees').select(cols).eq('profile_id', profileId).order('created_at').order('id')
  if (error) throw new EmployeeSetupReadError()
  return classifyEmployeeLink((data ?? []) as unknown as EmployeeLinkRow[], { ratesRead: !!opts.includeRates })
}

/** Antal AKTIVE medarbejderrækker på et login, eventuelt uden en bestemt række. Læsefejl kastes (aldrig 0). */
export async function countActiveEmployeesForProfile(client: SupabaseClient, profileId: string, excludeEmployeeId?: string): Promise<number> {
  let q = client.from('employees').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('active', true)
  if (excludeEmployeeId) q = q.neq('id', excludeEmployeeId)
  const { count, error } = await q
  if (error || count == null) throw new EmployeeSetupReadError()
  return count
}

/**
 * Må en medarbejder få et login koblet / genaktiveres uden at gøre et login tvetydigt? Returnerer en fejltekst eller null.
 * Kun AKTIVE rækker tæller — inaktive rækker er historik og må gerne pege på samme login.
 */
export async function activeLinkConflict(client: SupabaseClient, profileId: string, employeeId?: string): Promise<string | null> {
  const others = await countActiveEmployeesForProfile(client, profileId, employeeId)
  return others > 0 ? 'Login\'et er allerede koblet til en anden aktiv medarbejder. Et login må kun have én aktiv medarbejder — deaktivér den anden først.' : null
}

/**
 * Rolleskift TIL montør kræver en entydig, aktiv medarbejder (ellers en halvt opsat montør uden job/tid).
 * expectEmployeeId: skiftet sker fra et bestemt medarbejderkort — så skal netop den række være den aktive.
 */
export function montorRoleChangeError(setup: EmployeeSetup, expectEmployeeId?: string): string | null {
  if (setup.state === 'missing') return 'En montør skal have en medarbejder. Opret eller kobl medarbejderen under Medarbejdere først — rollen er ikke ændret.'
  if (setup.state === 'inactive_only') return 'Login\'et er kun koblet til en inaktiv medarbejder. Genaktivér medarbejderen først — rollen er ikke ændret.'
  if (setup.state === 'ambiguous') return 'Login\'et er koblet til flere aktive medarbejdere. Ret koblingen først — rollen er ikke ændret.'
  if (expectEmployeeId && setup.employeeId !== expectEmployeeId) return 'Medarbejderen er ikke aktiv. Genaktivér den først — rollen er ikke ændret.'
  return null
}

/**
 * Planlægning: kan arbejde tildeles medarbejderen, så tiden senere kan registreres? Kræver admin-klient (satser).
 * - inaktiv/fratrådt → afvist (som før)
 * - mangler timepris → afvist (tiden kan ellers aldrig afsluttes; samme regel som tidsregistreringens forhåndstjek)
 * - login'et har flere aktive medarbejdere → afvist (montøren ville ikke se jobbet entydigt)
 * Kostprisen tjekkes IKKE her: med firmaets faste kostsats må den mangle på medarbejderen (00230 afgør).
 */
export async function assignableEmployeeError(admin: SupabaseClient, employeeId: string, today: string): Promise<string | null> {
  const { data, error } = await admin.from('employees').select('id, active, termination_date, hourly_rate, profile_id').eq('id', employeeId).maybeSingle()
  if (error) return 'Kunne ikke tjekke medarbejderen. Det tælles ikke som at personen ikke findes.'
  if (!data) return 'Medarbejder findes ikke'
  const e = data as { active: boolean | null; termination_date: string | null; hourly_rate: unknown; profile_id: string | null }
  if (!e.active || (e.termination_date && e.termination_date < today)) return 'Medarbejder er inaktiv'
  if (knownRate(e.hourly_rate) === null) return 'Medarbejderen mangler timepris, så tiden på jobbet kan ikke registreres. Sæt timeprisen på medarbejderkortet først.'
  if (e.profile_id) {
    let others: number
    try { others = await countActiveEmployeesForProfile(admin, e.profile_id, employeeId) } catch { return 'Kunne ikke tjekke medarbejderens login. Prøv igen.' }
    if (others > 0) return 'Medarbejderens login er koblet til flere aktive medarbejdere, så jobbet ville ikke blive vist entydigt. Ret koblingen under Medarbejdere først.'
  }
  return null
}
