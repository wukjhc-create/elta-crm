/**
 * Relatel-integrationskontrakt (P3 #15) — KUN typer og en gatet klient-graense. INGEN netvaerkskald i denne fil.
 *
 * Verificeret mod den offentlige dokumentation (dev.relatel.dk, dev.relatel.dk/oas v2.1.2, dev.relatel.dk/iframe),
 * 2026-09-28. Felter markeret UVERIFICERET kan foerst bekraeftes med et rigtigt access-token (BLOCKED: Henrik).
 * Se docs/integrations/RELATEL_CONTRACT.md for arkitektur og gates.
 */

/** Relatel-nummerformat: landekode + nummer uden '+'/'00' (fx '4571999999'). Se phone.ts. */
export type RelatelNumber = string

/** GET /calls — UVERIFICERET feltliste (ikke offentligt dokumenteret); bruges kun bag en adapter. */
export interface RelatelCall {
  uuid: string
  direction?: 'inbound' | 'outbound'
  from?: RelatelNumber
  to?: RelatelNumber
  started_at?: string
  answered_at?: string | null
  ended_at?: string | null
  duration_seconds?: number | null
  employee_id?: number | null
}

/** GET /contacts/by_number/{number} — kontakt i Relatels egen telefonbog. */
export interface RelatelContact {
  id: number
  name?: string
  number?: RelatelNumber
}

/** Klassificering af operationer efter samme model som Agent Core (side-effekt-klasser). */
export const RELATEL_OPERATIONS = {
  listCalls: { method: 'GET', path: '/calls', effect: 'read' },
  getContactByNumber: { method: 'GET', path: '/contacts/by_number/{number}', effect: 'read' },
  listVoicemails: { method: 'GET', path: '/voicemails', effect: 'read' },
  startCall: { method: 'POST', path: '/calls', effect: 'push_external' },   // ringer rigtigt op
  sendMessage: { method: 'POST', path: '/messages', effect: 'send_external' }, // rigtig SMS
} as const

export type RelatelOperation = keyof typeof RELATEL_OPERATIONS

export interface RelatelClient {
  listCalls(params: { since: string }): Promise<RelatelCall[]>
  getContactByNumber(number: RelatelNumber): Promise<RelatelContact | null>
  startCall(params: { to: RelatelNumber; employeeId: number }): Promise<{ uuid: string }>
  sendMessage(params: { to: RelatelNumber[]; body: string; sender: string }): Promise<{ ids: string[] }>
}

export class RelatelDisabledError extends Error {
  constructor(op: RelatelOperation) {
    super(`Relatel er ikke aktiveret (${op}: ${RELATEL_OPERATIONS[op].effect}) — kræver credential + beslutning`)
    this.name = 'RelatelDisabledError'
  }
}

/**
 * Den eneste klient i koden i dag: afviser ALT. En rigtig HTTP-klient tilfoejes foerst naar (1) et access-token
 * findes, (2) kontrakten er verificeret mod API'et, og (3) Henrik har godkendt. Skrivende operationer
 * (startCall/sendMessage) skal derudover gaa gennem Agent Core-lignende approval + live-gate (AGENT_LIVE_SEND_ENABLED).
 */
export const disabledRelatelClient: RelatelClient = {
  listCalls: async () => { throw new RelatelDisabledError('listCalls') },
  getContactByNumber: async () => { throw new RelatelDisabledError('getContactByNumber') },
  startCall: async () => { throw new RelatelDisabledError('startCall') },
  sendMessage: async () => { throw new RelatelDisabledError('sendMessage') },
}
