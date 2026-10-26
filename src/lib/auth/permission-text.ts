/**
 * R-12 (pilot-review 2026-10-15): "Manglende tilladelse: offers.edit" viste interne rettighedsnøgler for brugerne.
 * Dansk tekst ud fra nøglen ("Du har ikke adgang til at redigere tilbud."). Bruges af de centrale gates og af
 * toast-komponenten (som viser langt de fleste fejl). Bevidst IKKE 'use server'.
 */

const NOUN: Record<string, string> = {
  offers: 'tilbud', customers: 'kunder', leads: 'leads', invoices: 'fakturaer', cases: 'sager', work_orders: 'arbejdsordrer',
  time_logs: 'timer', inbox: 'mail', settings: 'indstillinger', employees: 'medarbejdere', materials: 'materialer',
  products: 'produkter', tasks: 'opgaver', calendar: 'kalenderen', users: 'brugere', bank: 'bank', incoming_invoices: 'leverandørfakturaer',
  economy: 'økonomi', tools: 'værktøjer', service: 'service', projects: 'projekter', reports: 'rapporter', suppliers: 'leverandører',
  messages: 'beskeder', portal: 'kundeportalen', calculations: 'kalkulationer',
}
const VERB: Record<string, string> = {
  view: 'se', edit: 'redigere', create: 'oprette', delete: 'slette', send: 'sende', approve: 'godkende', close: 'lukke',
  plan: 'planlægge', complete: 'afslutte', manage: 'administrere', export: 'eksportere', import: 'importere',
}

export function permissionDeniedText(permission: string): string {
  const [mod, action] = permission.split('.')
  const noun = NOUN[mod]
  const verb = VERB[action ?? '']
  if (noun && verb) return `Du har ikke adgang til at ${verb} ${noun}.`
  if (noun) return `Du har ikke adgang til denne handling (${noun}).`
  return 'Du har ikke adgang til denne handling.'
}

/** PERM-1: nøgler hvis struktur ikke passer til "verbum + navneord" — skrevet på dansk i hånden */
const LABELS: Record<string, string> = {
  'customers.emails.view': 'Se kunders e-mails', 'tasks.menu': 'Se egne opgaver (menu)',
  'time.log': 'Registrere timer', 'time.view_own': 'Se egne timer', 'time.view_all': 'Se alles timer',
  'time.edit_own': 'Rette egne timer', 'time.edit_all': 'Rette alles timer', 'users.manage_roles': 'Administrere roller og rettigheder',
  'tools.calculations': 'Kalkulationer', 'tools.ai_project': 'AI-projektberegner', 'tools.products': 'Produktkatalog',
  'tools.pricing': 'Prisstyring', 'tools.packages': 'Pakker', 'tools.solar_calc': 'Solcelleberegner', 'tools.reports': 'Rapporter (værktøj)',
  'calendar.view.team': 'Se kalenderen (team)', 'materials.add_to_case': 'Tilføje materialer til sag', 'other_costs.add_to_case': 'Tilføje øvrige omkostninger til sag',
  'other_costs.view': 'Se øvrige omkostninger', 'other_costs.edit': 'Redigere øvrige omkostninger', 'other_costs.delete': 'Slette øvrige omkostninger',
  'invoices.mark_paid': 'Markere fakturaer betalt', 'invoices.credit': 'Kreditere fakturaer', 'invoices.delete_draft': 'Slette fakturakladder',
  'employees.payroll.view': 'Se løn', 'employees.payroll.edit': 'Redigere løn', 'economy.cost_prices': 'Se kostpriser og avance',
  'settings.suppliers': 'Leverandør-indstillinger', 'settings.economic': 'e-conomic-indstillinger',
  'materials.view.cost_prices': 'Se materialers kostpriser', 'products.view.cost_prices': 'Se produkters kostpriser',
  'offers.view.cost_prices': 'Se kostpriser i tilbud', 'suppliers.credentials': 'Leverandør-logins (adgangsoplysninger)',
}

/** PERM-1: dansk etiket for en rettighedsnøgle i admin-UI'et (fx "Oprette kunder", "Se sager (alle)") */
export function permissionLabel(permission: string): string {
  if (LABELS[permission]) return LABELS[permission]
  const parts = permission.split('.')
  const noun = NOUN[parts[0]] ?? parts[0].replace(/_/g, ' ')
  const verb = VERB[parts[1] ?? ''] ?? (parts[1] ?? '').replace(/_/g, ' ')
  const rest = parts.slice(2).join('.')
  const scope = rest === 'all' ? ' (alle)' : rest === 'own' || rest === 'assigned' || rest === 'own_cases' ? ' (egne)' : rest === 'team' ? ' (team)' : rest ? ` (${rest.replace(/[._]/g, ' ')})` : ''
  const text = `${verb} ${noun}${scope}`.trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const RE = /Manglende tilladelse:\s*([a-z_]+(?:\.[a-z_]+)*)/i

/** Erstatter "Manglende tilladelse: x.y" i en fejltekst med dansk tekst; andet returneres uændret. */
export function humanizeErrorText<T extends string | undefined | null>(msg: T): T {
  if (!msg) return msg
  const m = RE.exec(msg)
  if (!m) return msg
  return msg.replace(RE, permissionDeniedText(m[1]).replace(/\.$/, '')) as T
}
