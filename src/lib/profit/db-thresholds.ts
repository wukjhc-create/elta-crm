/**
 * PE-7 (Profit Engine-review 2026-10-14): ÉN kilde til DB-tærskler (dækningsgrad i %).
 *
 * Kilde: calculation_settings (Indstillinger → Kalkulation → Trafiklys/Minimum DB). Mangler en nøgle, gælder
 * standarderne nedenfor — de er de værdier koden hidtil har brugt, så prod (hvor kun minimum_db og default_db_target
 * er sat) ikke ændrer adfærd.
 *
 *   red     — under = rød/"lav DB" (sags-flag, AI-risiko høj, afsendelsesværn på tilbud)
 *   yellow  — under = gul (AI-risiko mellem)
 *   green   — fra og med = grøn (farve på sagens DB)
 *   minimum — profitkortets "minimum DB" på tilbud
 *   target  — mål-DB
 *
 * Bevidst ikke samlet her (kræver beslutning, se HENRIK-DECISIONS): minimum (20) og red (10) er i dag to forskellige
 * grænser — profitkortet advarer under 20 %, mens afsendelse først kræver bekræftelse under 10 %.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CALC_DEFAULTS } from '@/lib/constants'

export const DEFAULT_DB_RED_THRESHOLD = 10

export interface DbThresholds {
  red: number
  yellow: number
  green: number
  minimum: number
  target: number
}

export const DEFAULT_DB_THRESHOLDS: DbThresholds = {
  red: DEFAULT_DB_RED_THRESHOLD,
  yellow: CALC_DEFAULTS.MARGINS.MINIMUM_DB,
  green: CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET,
  minimum: CALC_DEFAULTS.MARGINS.MINIMUM_DB,
  target: CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET,
}

const KEY_MAP: Record<string, keyof DbThresholds> = {
  db_red_threshold: 'red',
  db_yellow_threshold: 'yellow',
  db_green_threshold: 'green',
  minimum_db: 'minimum',
  default_db_target: 'target',
}

export const DB_THRESHOLD_SETTING_KEYS = Object.keys(KEY_MAP)

/** Rækker fra calculation_settings → tærskler (ugyldige/manglende værdier = standard). */
export function resolveDbThresholds(rows: Array<{ setting_key: string; setting_value: unknown }>): DbThresholds {
  const out: DbThresholds = { ...DEFAULT_DB_THRESHOLDS }
  for (const r of rows) {
    const k = KEY_MAP[r.setting_key]
    if (!k) continue
    const v = (r.setting_value as { percentage?: unknown } | null)?.percentage
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

export type DbLevel = 'green' | 'yellow' | 'red'

/** Farveniveau: < red = rød, < green = gul, ellers grøn. */
export function dbLevel(pct: number, t: Pick<DbThresholds, 'red' | 'green'>): DbLevel {
  if (pct < t.red) return 'red'
  if (pct < t.green) return 'yellow'
  return 'green'
}

/** Risikoniveau (AI-snapshots): < red = høj, < yellow = mellem, ellers lav. */
export function dbRisk(pct: number, t: Pick<DbThresholds, 'red' | 'yellow'>): 'high' | 'medium' | 'low' {
  if (pct < t.red) return 'high'
  if (pct < t.yellow) return 'medium'
  return 'low'
}

/** Læser tærsklerne (fejl → standarder; DB-tærskler er ikke følsomme). */
export async function loadDbThresholds(supabase: SupabaseClient): Promise<DbThresholds> {
  try {
    const { data, error } = await supabase.from('calculation_settings').select('setting_key, setting_value').in('setting_key', DB_THRESHOLD_SETTING_KEYS)
    if (error || !Array.isArray(data)) return { ...DEFAULT_DB_THRESHOLDS }
    return resolveDbThresholds(data as Array<{ setting_key: string; setting_value: unknown }>)
  } catch {
    return { ...DEFAULT_DB_THRESHOLDS }
  }
}
