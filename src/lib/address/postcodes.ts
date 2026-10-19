/**
 * ADDR-1 beslutning B (Henrik 2026-10-19): postnummer → by fra det IMPORTEREDE officielle DAR-datasæt (lokal, hurtig,
 * ingen runtime-afhængighed). Datasættet opdateres med scripts/import-dk-postcodes.ts (kilde/version/dato i meta).
 * Ukendt postnummer → null (feltet udfyldes manuelt; intet gæt). Bevidst IKKE 'use server'.
 */
import dataset from '@/lib/address/data/dk-postcodes.json'

const POSTCODES = (dataset as { postcodes: Record<string, string> }).postcodes

export const POSTCODE_DATASET_META = (dataset as { meta: { source: string; sourceVersion: string | null; fetchedAt: string; count: number; license: string } }).meta

export function cityForPostcodeLocal(postcode: string | null | undefined): string | null {
  const nr = String(postcode ?? '').trim()
  if (!/^\d{4}$/.test(nr)) return null
  return POSTCODES[nr] ?? null
}
