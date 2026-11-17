/**
 * Henvendelser — kontor-visninger og kanal-filtre (fase 3A). Bevidst IKKE 'use server' (konstanter må ikke eksporteres
 * fra en server-action-fil). Bruges af siden, klienten og listHenvendelser.
 */
export type HenvendelseView = 'new' | 'mine' | 'unassigned' | 'urgent' | 'awaiting_customer' | 'awaiting_elta' | 'handled' | 'team' | 'handoff' | 'all'
export const HENVENDELSE_VIEWS: HenvendelseView[] = ['new', 'mine', 'unassigned', 'urgent', 'awaiting_customer', 'awaiting_elta', 'handled', 'team', 'handoff', 'all']
export type HenvendelseChannel = 'email' | 'portal' | 'web_chat' | 'phone' | 'sms'
export const HENVENDELSE_CHANNELS: HenvendelseChannel[] = ['email', 'portal', 'web_chat', 'phone', 'sms']
export const OPEN_STATES = ['new', 'open', 'handoff', 'awaiting_customer', 'awaiting_elta'] as const

export const VIEW_LABEL: Record<HenvendelseView, string> = {
  new: 'Nye', mine: 'Mine', unassigned: 'Ikke tildelt', urgent: 'Haster', awaiting_customer: 'Venter på kunde',
  awaiting_elta: 'Venter på ELTA', handled: 'Håndteret', team: 'Mit team', handoff: 'Kræver medarbejder', all: 'Alle',
}
export const CHANNEL_LABEL: Record<HenvendelseChannel, string> = { email: 'Mail', portal: 'Portal', web_chat: 'Web-chat', phone: 'Telefon', sms: 'SMS' }

/** Ældre ?filter=-værdier (fase 2) → visning + kanal, så gamle links virker */
export function parseHenvendelseQuery(filter: string | undefined, channel: string | undefined): { view: HenvendelseView; channel: HenvendelseChannel | null } {
  const legacy: Record<string, HenvendelseChannel> = { phone: 'phone', email: 'email', sms: 'sms', portal_chat: 'portal' }
  if (filter && legacy[filter]) return { view: 'all', channel: legacy[filter] }
  const view = (HENVENDELSE_VIEWS as string[]).includes(filter ?? '') ? (filter as HenvendelseView) : 'new'
  const ch = (HENVENDELSE_CHANNELS as string[]).includes(channel ?? '') ? (channel as HenvendelseChannel) : null
  return { view, channel: ch }
}
