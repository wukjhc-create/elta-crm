/** Ren klassifikation af danske fejltekster fra pilot-handlinger (bruges af action-failure-log; testet i scripts/action-failure-class-test.ts) */
export type ActionFailureClass = 'permission' | 'rate' | 'overlap' | 'not_found' | 'locked' | 'conflict' | 'db' | 'validation' | 'other'

export function classifyActionFailure(message: string): ActionFailureClass {
  const m = message.toLowerCase()
  if (/ikke adgang|ingen adgang|tilladelse|ikke logget ind|auth_required|permission|ikke tildelt dig|kun (registrere|slette|ændre) (tid|dine)|kun kontoret/.test(m)) return 'permission'
  if (/timepris|kostpris mangler|mangler kostpris|sats/.test(m)) return 'rate'
  if (/overlap/.test(m)) return 'overlap'
  if (/ikke fundet|findes ikke|not found/.test(m)) return 'not_found'
  if (/ændret i mellemtiden|ændret samtidig/.test(m)) return 'conflict'
  if (/godkendte|faktureret|annulleret|afsluttet|lukket|låst|allerede underskrevet|aktiv timer/.test(m)) return 'locked'
  if (/^kunne ikke (hente|læse|gemme|kontrollere)|prøv igen|uventet fejl/.test(m)) return 'db'
  if (/ugyldig|mangler|skal |for stor|filtype|påkrævet|kun billeder|ingen fil|angiv|negativ/.test(m)) return 'validation'
  return 'other'
}
