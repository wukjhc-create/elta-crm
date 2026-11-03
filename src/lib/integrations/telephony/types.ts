/**
 * Telefoni inde i ELTA CRM. Relatel er en udbyder, ikke et selvstændigt system.
 * Typerne er bevidst smallere end Relatels udokumenterede webhook-format.
 */

export type TelephonyEventType =
  | 'call.started'
  | 'call.answered'
  | 'call.missed'
  | 'call.ended'
  | 'voicemail.created'
  | 'sms.received'
  | 'sms.sent'

export interface TelephonyEvent {
  /** Stabil nøgle. Samme nøgle to gange er samme hændelse. */
  idempotencyKey: string
  provider: 'relatel'
  eventType: TelephonyEventType
  occurredAt: string
  direction: 'inbound' | 'outbound' | null
  /** Relatel-format (landekode + nummer) eller null. */
  from: string | null
  to: string | null
  externalId: string
  durationSeconds: number | null
  answered: boolean | null
  hasVoicemail: boolean
  /** Officielle Relatel-webhooks er ikke verificeret. Kun vores egen konvolut er `canonical`. */
  schema: 'canonical' | 'unverified_call'
  /** Relatels medarbejder-id (kobles til en profil via telephony_employee_links — aldrig via navn) */
  providerEmployeeId?: string | null
  /** Telefonsvarer: kun metadata (ingen lyd, URL eller transskription) */
  voicemailDurationSeconds?: number | null
  providerVoicemailId?: string | null
}

export interface TelephonyStore {
  has(key: string): Promise<boolean>
  put(event: TelephonyEvent): Promise<'created' | 'duplicate'>
}

export class MemoryTelephonyStore implements TelephonyStore {
  readonly events: TelephonyEvent[] = []
  async has(key: string): Promise<boolean> {
    return this.events.some((e) => e.idempotencyKey === key)
  }
  async put(event: TelephonyEvent): Promise<'created' | 'duplicate'> {
    if (await this.has(event.idempotencyKey)) return 'duplicate'
    this.events.push(event)
    return 'created'
  }
}
