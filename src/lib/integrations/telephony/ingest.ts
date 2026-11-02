/**
 * Idempotent modtagelse. Butikken afgør om nøglen er set før.
 * Webhook-routen kalder den ikke, før tabellen er migreret og Claude har godkendt den.
 */
import type { TelephonyEvent, TelephonyStore } from './types'

export async function ingestTelephonyEvent(store: TelephonyStore, event: TelephonyEvent): Promise<'created' | 'duplicate'> {
  if (await store.has(event.idempotencyKey)) return 'duplicate'
  return store.put(event)
}
