/**
 * Dublet-varenumre i en prisfil (ren logik). Bevidst IKKE 'use server'.
 *
 * Pris-review 2026-10-07 (X4e): samme varenummer to gange i en manuel import → for en NY vare ramte bunke-indsættelsen
 * (100 ad gangen) unik-nøglen, og alle 100 nye varer i bunken blev afvist; for en eksisterende vare blev der lavet to
 * opdateringer og to price_history-rækker. Sidste række for et varenummer vinder (som LM-cronen); rækker uden varenummer
 * bevares (de afvises af valideringen).
 */
export function dedupeRowsBySku<T extends { parsed: { sku?: string | null } }>(rows: T[]): { rows: T[]; duplicates: number } {
  const lastIndex = new Map<string, number>()
  rows.forEach((r, i) => { const sku = r.parsed.sku?.trim(); if (sku) lastIndex.set(sku, i) })
  const out = rows.filter((r, i) => { const sku = r.parsed.sku?.trim(); return !sku || lastIndex.get(sku) === i })
  return { rows: out, duplicates: rows.length - out.length }
}
