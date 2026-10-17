/**
 * ÉN anvendelse af en parset LEMU-prisfil på supplier_products (cron /api/cron/lemu-sync OG manuel "Synk LEMU nu").
 *
 * SU-1 (review 2026-10-17): den manuelle synk havde sin egen rækkevise løkke (én update/insert pr. vare — kan ikke blive
 * færdig på det rigtige katalog på ~300.000 varer) og manglede cronens rettelser:
 *  - SU-2: kost ≤ 0 = ingen prisaftale → behold kendt kost; nye varer uden kost oprettes ikke (0-kr-varer)
 *  - SU-3: prishistorik kun for rækker hvis opdatering lykkedes, skrevet sammen med batchen
 *  - SU-5: kategori/underkategori/EAN/producent nulstilles ikke ved opdatering
 * Antal opdaterede/nye tælles kun for batches der lykkedes. Bevidst IKKE 'use server'.
 */
import { logger } from '@/lib/utils/logger'
import { loadExistingSupplierProducts } from '@/lib/suppliers/load-existing-products'
import type { FtpSyncResult } from '@/lib/services/supplier-ftp-sync'

type Client = { from: (t: string) => any }

const UPSERT_BATCH_SIZE = 1000

export interface LemuApplyResult {
  totalParsed: number
  deduplicated: number
  newProducts: number
  updatedProducts: number
  priceChanges: number
  skippedNoCost: number
  errors: string[]
  existingLoaded: number
  existingTotal: number
  existingMs: number
}

export async function applyLemuRows(
  supabase: Client,
  supplierId: string,
  rows: FtpSyncResult['rows'],
  opts: { existingBudgetMs?: number; logLabel?: string; loadExisting?: typeof loadExistingSupplierProducts } = {},
): Promise<LemuApplyResult> {
  const label = opts.logLabel ?? 'LEMU'
  // Gyldige rækker, dedupliceret på varenr. (sidste forekomst vinder)
  const rowsBySku = new Map<string, FtpSyncResult['rows'][number]>()
  for (const row of rows) {
    if (row.parsed.sku && row.errors.length === 0) rowsBySku.set(row.parsed.sku, row)
  }
  const validRows = Array.from(rowsBySku.values())

  const result: LemuApplyResult = {
    totalParsed: rows.length, deduplicated: validRows.length, newProducts: 0, updatedProducts: 0, priceChanges: 0,
    skippedNoCost: 0, errors: [], existingLoaded: 0, existingTotal: 0, existingMs: 0,
  }
  if (validRows.length === 0) return result

  // X4 (pris-review 2026-10-07): ALLE eksisterende produkter (paginering med tidsbudget)
  const existingLoad = await (opts.loadExisting ?? loadExistingSupplierProducts)(supabase, supplierId, { budgetMs: opts.existingBudgetMs ?? 60_000 })
  const productsBySku = existingLoad.bySku
  result.existingLoaded = existingLoad.loaded
  result.existingTotal = existingLoad.total
  result.existingMs = existingLoad.ms
  if (!existingLoad.complete) {
    logger.warn(`${label}: eksisterende produkter kun delvist indlæst (tidsbudget)`, { metadata: { loaded: existingLoad.loaded, total: existingLoad.total, ms: existingLoad.ms } })
  }
  const now = new Date().toISOString()

  const historyBySku = new Map<string, Record<string, unknown>>()
  const newRecords: Array<Record<string, unknown>> = []
  const updateRecords: Array<Record<string, unknown>> = []

  for (const row of validRows) {
    const existing = productsBySku.get(row.parsed.sku)
    if (existing) {
      const oldCost = existing.cost_price
      // SU-2: kost ≤ 0 = ingen prisaftale i filen → behold kendt kost (som supplier-sync, GP-13)
      const newCost = row.parsed.cost_price != null && row.parsed.cost_price > 0 ? row.parsed.cost_price : null
      if (oldCost !== null && newCost !== null && oldCost !== newCost) {
        const changePct = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0
        historyBySku.set(row.parsed.sku, {
          supplier_product_id: existing.id,
          old_cost_price: oldCost,
          new_cost_price: newCost,
          old_list_price: existing.list_price,
          new_list_price: row.parsed.list_price,
          change_percentage: Math.round(changePct * 100) / 100,
          change_source: 'ftp_sync',
        })
      }
      updateRecords.push({
        supplier_id: supplierId,
        supplier_sku: row.parsed.sku,
        supplier_name: row.parsed.name || row.parsed.sku,
        // X4/SU-2: tom priscelle eller 0 overskriver ikke en kendt kostpris
        cost_price: newCost ?? existing.cost_price ?? 0,
        list_price: row.parsed.list_price ?? existing.list_price,
        unit: row.parsed.unit || 'stk',
        // SU-5: kategori/underkategori/EAN/producent sendes IKKE ved opdatering (filen har ingen underkategori og
        // tomme EAN-celler; før nulstillede hver kørsel manuelle værdier og GP-3-avanceregler)
        is_available: true,
        last_synced_at: now,
      })
    } else {
      // SU-2: ny vare uden kostpris (> 0) oprettes ikke
      if (!(row.parsed.cost_price != null && row.parsed.cost_price > 0)) { result.skippedNoCost++; continue }
      newRecords.push({
        supplier_id: supplierId,
        supplier_sku: row.parsed.sku,
        supplier_name: row.parsed.name || row.parsed.sku,
        cost_price: row.parsed.cost_price,
        list_price: row.parsed.list_price,
        unit: row.parsed.unit || 'stk',
        category: row.parsed.category || 'Lemu Import',
        sub_category: row.parsed.sub_category || null,
        ean: row.parsed.ean || null,
        manufacturer: row.parsed.manufacturer || null,
        is_available: true,
        status: 'pending',
        data_source: 'import',
        last_synced_at: now,
      })
    }
  }

  // Nye varer (bulk upsert)
  for (let i = 0; i < newRecords.length; i += UPSERT_BATCH_SIZE) {
    const batch = newRecords.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    try {
      const { error } = await supabase.from('supplier_products').upsert(batch, { onConflict: 'supplier_id,supplier_sku', ignoreDuplicates: false })
      if (error) {
        result.errors.push(`New batch ${batchNum}: ${error.message}`)
        logger.warn(`${label} new batch ${batchNum} error`, { error })
      } else {
        result.newProducts += batch.length
      }
    } catch (batchError) {
      result.errors.push(`New batch ${batchNum}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
    }
  }

  // Eksisterende varer (bulk upsert, bevarer status/data_source) + historik for lykkede batches
  for (let i = 0; i < updateRecords.length; i += UPSERT_BATCH_SIZE) {
    const batch = updateRecords.slice(i, i + UPSERT_BATCH_SIZE)
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
    try {
      const { error } = await supabase.from('supplier_products').upsert(batch, { onConflict: 'supplier_id,supplier_sku', ignoreDuplicates: false })
      if (error) {
        result.errors.push(`Update batch ${batchNum}: ${error.message}`)
        logger.warn(`${label} update batch ${batchNum} error`, { error })
        continue
      }
      result.updatedProducts += batch.length
      const hist = batch.map((r) => historyBySku.get(String(r.supplier_sku))).filter((h): h is Record<string, unknown> => !!h)
      result.priceChanges += hist.length
      if (hist.length > 0) {
        const { error: histErr } = await supabase.from('price_history').insert(hist)
        if (histErr) logger.error(`Price history insert error (${label})`, { error: histErr })
      }
    } catch (batchError) {
      result.errors.push(`Update batch ${batchNum}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
    }
  }

  return result
}
