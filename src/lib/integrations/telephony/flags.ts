/**
 * Relatel-flags. Standard FRA. Kun den præcise værdi `true` tænder et flag.
 * Live-opkald og SMS kræver også master-flaget. Ingen af dem åbner et netværkskald.
 */
const isTrue = (v: string | undefined) => (v ?? '').trim().toLowerCase() === 'true'

export function relatelEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isTrue(env.RELATEL_ENABLED)
}

export function relatelLiveCallEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return relatelEnabled(env) && isTrue(env.RELATEL_LIVE_CALL_ENABLED)
}

export function relatelSmsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return relatelEnabled(env) && isTrue(env.RELATEL_SMS_ENABLED)
}

export const RELATEL_FLAG_OFF = {
  master: 'Relatel er slået fra (RELATEL_ENABLED).',
  liveCall: 'Click-to-call er slået fra (RELATEL_LIVE_CALL_ENABLED).',
  sms: 'SMS er slået fra (RELATEL_SMS_ENABLED).',
  noClient: 'Der er ikke koblet en live-klient på. Intet er sendt til Relatel.',
} as const

/**
 * 00247: gem webhook-hændelser i telephony_calls/telephony_events. Kræver også master-flaget. Standard FRA — fra er
 * adfærden som før (202, persisted:false). Tændes kun på staging/test indtil Henrik godkender prod.
 */
export function telephonyPersistEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return relatelEnabled(env) && isTrue(env.TELEPHONY_PERSIST_ENABLED)
}

/**
 * Kunde-forslag ved lagring: 'suggest' udfylder kun suggested_customer_id (præcis én kunde) — bekræfter ALDRIG.
 * Alt andet end den præcise værdi 'suggest' = 'off'.
 */
export function telephonyMatchMode(env: Record<string, string | undefined> = process.env): 'off' | 'suggest' {
  return (env.TELEPHONY_MATCH_MODE ?? '').trim().toLowerCase() === 'suggest' ? 'suggest' : 'off'
}
