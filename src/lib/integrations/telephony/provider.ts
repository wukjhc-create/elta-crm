/**
 * Telefoni-udbyder. Den eneste implementation ringer ikke og sender ikke SMS.
 * Et tændt flag gør knappen "armet" i forklaringen, men `placed`/`sent` er altid false.
 */
import { RELATEL_FLAG_OFF, relatelEnabled, relatelLiveCallEnabled, relatelSmsEnabled } from './flags'

export interface TelephonyRefusal {
  ok: false
  placed: false
  sent: false
  reason: string
}

export interface TelephonyProvider {
  id: 'relatel'
  /** `off` indtil master-flaget er tændt. `test` betyder flaget er tændt, men der er ingen HTTP-klient. Aldrig `active`. */
  mode: 'off' | 'test'
  listCalls(): Promise<TelephonyRefusal>
  startCall(to: string): Promise<TelephonyRefusal>
  sendSms(to: string, body: string): Promise<TelephonyRefusal>
}

function refusal(reason: string): TelephonyRefusal {
  return { ok: false, placed: false, sent: false, reason }
}

export function createRelatelProvider(env: Record<string, string | undefined> = process.env): TelephonyProvider {
  const master = relatelEnabled(env)
  return {
    id: 'relatel',
    mode: master ? 'test' : 'off',
    listCalls: async () => refusal(master ? RELATEL_FLAG_OFF.noClient : RELATEL_FLAG_OFF.master),
    startCall: async () => refusal(
      !master ? RELATEL_FLAG_OFF.master : !relatelLiveCallEnabled(env) ? RELATEL_FLAG_OFF.liveCall : RELATEL_FLAG_OFF.noClient,
    ),
    sendSms: async () => refusal(
      !master ? RELATEL_FLAG_OFF.master : !relatelSmsEnabled(env) ? RELATEL_FLAG_OFF.sms : RELATEL_FLAG_OFF.noClient,
    ),
  }
}
