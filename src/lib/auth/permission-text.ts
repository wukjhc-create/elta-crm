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

const RE = /Manglende tilladelse:\s*([a-z_]+(?:\.[a-z_]+)*)/i

/** Erstatter "Manglende tilladelse: x.y" i en fejltekst med dansk tekst; andet returneres uændret. */
export function humanizeErrorText<T extends string | undefined | null>(msg: T): T {
  if (!msg) return msg
  const m = RE.exec(msg)
  if (!m) return msg
  return msg.replace(RE, permissionDeniedText(m[1]).replace(/\.$/, '')) as T
}
