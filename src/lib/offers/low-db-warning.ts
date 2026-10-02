/**
 * N8a (Henrik 2026-10-02): lav DB er en ADVARSEL, ikke en blokering. Et tilbud med DB under minimum (Trafiklys → rød
 * grænse) kan sendes, men kun når brugeren aktivt har bekræftet advarslen — klienten viser den, serveren kræver
 * bekræftelsen. Hard block overvejes først, når kostdata er dokumenteret komplette (i dag mangler mange linjer kost).
 * Ren og deterministisk (ingen I/O).
 */
import { computeOfferDB, type LineItemForDB } from '@/lib/logic/pricing'

/** Fejlkode-præfiks når bekræftelse mangler — klienten genkender den og spørger brugeren. */
export const LOW_DB_ACK_REQUIRED = 'LOW_DB_ACK_REQUIRED'

export interface OfferLowDbStatus {
  /** DB under minimum (kun når mindst én linje har kostpris — ellers kan DB ikke vurderes). */
  low: boolean
  dbPercentage: number
  threshold: number
  hasAnyCost: boolean
}

export function evaluateOfferLowDb(
  lineItems: LineItemForDB[],
  offerDiscountPercentage: number,
  redThreshold: number,
): OfferLowDbStatus {
  const db = computeOfferDB(lineItems, offerDiscountPercentage)
  return {
    low: db.hasAnyCost && db.totalCost > 0 && db.dbPercentage < redThreshold,
    dbPercentage: db.dbPercentage,
    threshold: redThreshold,
    hasAnyCost: db.hasAnyCost,
  }
}

export function lowDbAckMessage(s: OfferLowDbStatus): string {
  return `${LOW_DB_ACK_REQUIRED}: Dækningsbidraget er ${s.dbPercentage}% (minimum ${s.threshold}%). Bekræft advarslen for at sende tilbuddet.`
}
