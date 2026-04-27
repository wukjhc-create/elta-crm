'use server'

/**
 * Server Actions — Lemvigh-Müller SFTP Price Sync
 *
 * Provides manual trigger and status for the LEMU price import.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

// =====================================================
// Get LEMU sync status
// =====================================================

export interface LemuSyncStatus {
  supplier_id: string | null
  supplier_name: string
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_duration_ms: number | null
  last_sync_items: number | null
  product_count: number
  connection_configured: boolean
}

export async function getLemuSyncStatus(): Promise<ActionResult<LemuSyncStatus>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Find LM supplier
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .maybeSingle()

    if (!supplier) {
      return {
        success: true,
        data: {
          supplier_id: null,
          supplier_name: 'Lemvigh-Müller',
          last_sync_at: null,
          last_sync_status: null,
          last_sync_duration_ms: null,
          last_sync_items: null,
          product_count: 0,
          connection_configured: false,
        },
      }
    }

    // Get latest sync schedule status
    const { data: schedule } = await supabase
      .from('supplier_sync_schedules')
      .select('last_run_at, last_run_status, last_run_duration_ms, last_run_items_processed')
      .eq('supplier_id', supplier.id)
      .order('last_run_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    // Count products
    const { count } = await supabase
      .from('supplier_products')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id)

    // Check if FTP credentials are configured
    const { data: cred } = await supabase
      .from('supplier_credentials')
      .select('id')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    return {
      success: true,
      data: {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        last_sync_at: schedule?.last_run_at || null,
        last_sync_status: schedule?.last_run_status || null,
        last_sync_duration_ms: schedule?.last_run_duration_ms || null,
        last_sync_items: schedule?.last_run_items_processed || null,
        product_count: count || 0,
        connection_configured: !!cred,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente LEMU status') }
  }
}

// =====================================================
// Get ALL supplier sync statuses (AO + LM)
// =====================================================

export interface SupplierSyncOverview {
  code: string
  name: string
  supplier_id: string | null
  product_count: number
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_duration_ms: number | null
  last_sync_items: number | null
  connection_configured: boolean
  protocol: 'ftp' | 'sftp' | 'api' | 'none'
}

export async function getAllSupplierSyncStatuses(): Promise<ActionResult<SupplierSyncOverview[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get all active suppliers
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    if (!suppliers || suppliers.length === 0) {
      return { success: true, data: [] }
    }

    const results: SupplierSyncOverview[] = []

    for (const supplier of suppliers) {
      // Count products
      const { count } = await supabase
        .from('supplier_products')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)

      // Get latest sync schedule
      const { data: schedule } = await supabase
        .from('supplier_sync_schedules')
        .select('last_run_at, last_run_status, last_run_duration_ms, last_run_items_processed')
        .eq('supplier_id', supplier.id)
        .order('last_run_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      // Check for FTP/SFTP credentials
      const { data: ftpCred } = await supabase
        .from('supplier_credentials')
        .select('id')
        .eq('supplier_id', supplier.id)
        .eq('credential_type', 'ftp')
        .eq('is_active', true)
        .maybeSingle()

      // Check for API credentials
      const { data: apiCred } = await supabase
        .from('supplier_credentials')
        .select('id')
        .eq('supplier_id', supplier.id)
        .eq('credential_type', 'api')
        .eq('is_active', true)
        .maybeSingle()

      const code = (supplier.code || '').toUpperCase()
      const isSftp = code === 'LM'

      results.push({
        code,
        name: supplier.name,
        supplier_id: supplier.id,
        product_count: count || 0,
        last_sync_at: schedule?.last_run_at || null,
        last_sync_status: schedule?.last_run_status || null,
        last_sync_duration_ms: schedule?.last_run_duration_ms || null,
        last_sync_items: schedule?.last_run_items_processed || null,
        connection_configured: !!(ftpCred || apiCred),
        protocol: ftpCred ? (isSftp ? 'sftp' : 'ftp') : apiCred ? 'api' : 'none',
      })
    }

    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørstatus') }
  }
}

// =====================================================
// Manual LEMU sync trigger
// =====================================================

export async function triggerLemuSync(): Promise<ActionResult<{
  products_updated: number
  products_new: number
  price_changes: number
  file_name: string
}>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Find LM supplier
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .maybeSingle()

    if (!supplier) {
      return { success: false, error: 'Lemvigh-Müller leverandør ikke fundet i systemet. Opret den først under Indstillinger → Leverandører.' }
    }

    // Get FTP credentials
    const { data: credRow } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    if (!credRow) {
      return { success: false, error: 'Ingen SFTP-loginoplysninger konfigureret for Lemvigh-Müller.' }
    }

    // Decrypt credentials
    const { decryptCredentials } = await import('@/lib/utils/encryption')
    const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>

    const { buildFtpCredentials, executeFtpSync } = await import('@/lib/services/supplier-ftp-sync')
    const creds = buildFtpCredentials(
      { username: decrypted.username, password: decrypted.password, api_endpoint: credRow.api_endpoint || undefined, host: decrypted.host },
      'LM'
    )

    // Execute SFTP sync
    const syncStart = Date.now()
    const ftpResult = await executeFtpSync(creds, 'LM')

    if (ftpResult.rows.length === 0) {
      return { success: false, error: 'CSV-filen fra LEMU indeholdt ingen gyldige rækker.' }
    }

    // Load existing products for upsert
    const { data: existingProducts } = await supabase
      .from('supplier_products')
      .select('id, supplier_sku, cost_price, list_price')
      .eq('supplier_id', supplier.id)

    const productsBySku = new Map((existingProducts || []).map((p) => [p.supplier_sku, p]))
    const now = new Date().toISOString()

    let updatedProducts = 0
    let newProducts = 0
    let priceChanges = 0
    const priceHistoryBatch: Array<Record<string, unknown>> = []

    for (const row of ftpResult.rows) {
      if (!row.parsed.sku || row.errors.length > 0) continue

      const existing = productsBySku.get(row.parsed.sku)

      if (existing) {
        // Update existing product
        const oldCost = existing.cost_price
        const newCost = row.parsed.cost_price

        await supabase
          .from('supplier_products')
          .update({
            supplier_name: row.parsed.name || undefined,
            cost_price: newCost,
            list_price: row.parsed.list_price,
            unit: row.parsed.unit || undefined,
            category: row.parsed.category || undefined,
            sub_category: row.parsed.sub_category || undefined,
            ean: row.parsed.ean || undefined,
            manufacturer: row.parsed.manufacturer || undefined,
            is_available: true,
            last_synced_at: now,
          })
          .eq('id', existing.id)

        updatedProducts++

        if (oldCost !== null && newCost !== null && oldCost !== newCost) {
          const changePct = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0
          priceHistoryBatch.push({
            supplier_product_id: existing.id,
            old_cost_price: oldCost,
            new_cost_price: newCost,
            old_list_price: existing.list_price,
            new_list_price: row.parsed.list_price,
            change_percentage: Math.round(changePct * 100) / 100,
            change_source: 'ftp_sync',
          })
          priceChanges++
        }
      } else {
        // New product — create as draft under 'Lemu Import' category
        const category = row.parsed.category || 'Lemu Import'

        await supabase
          .from('supplier_products')
          .insert({
            supplier_id: supplier.id,
            supplier_sku: row.parsed.sku,
            supplier_name: row.parsed.name || row.parsed.sku,
            cost_price: row.parsed.cost_price || 0,
            list_price: row.parsed.list_price,
            unit: row.parsed.unit || 'stk',
            category,
            sub_category: row.parsed.sub_category || null,
            ean: row.parsed.ean || null,
            manufacturer: row.parsed.manufacturer || null,
            is_available: true,
            status: 'pending',
            data_source: 'import',
            last_synced_at: now,
          })

        newProducts++
      }
    }

    // Insert price history
    if (priceHistoryBatch.length > 0) {
      await supabase.from('price_history').insert(priceHistoryBatch)
    }

    const durationMs = Date.now() - syncStart

    // Create sync log
    await supabase.from('supplier_sync_logs').insert({
      supplier_id: supplier.id,
      job_type: 'ftp',
      status: 'completed',
      trigger_type: 'manual',
      started_at: new Date(syncStart).toISOString(),
      completed_at: now,
      duration_ms: durationMs,
      total_items: ftpResult.rows.length,
      processed_items: updatedProducts + newProducts,
      new_items: newProducts,
      updated_items: updatedProducts,
      price_changes_count: priceChanges,
      details: { file_name: ftpResult.file_name, file_size: ftpResult.file_size_bytes },
    })

    // Update schedule if exists
    await supabase
      .from('supplier_sync_schedules')
      .update({
        last_run_at: now,
        last_run_status: 'success',
        last_run_duration_ms: durationMs,
        last_run_items_processed: updatedProducts + newProducts,
      })
      .eq('supplier_id', supplier.id)

    logger.info('Manual LEMU sync completed', {
      metadata: { updated: updatedProducts, new: newProducts, priceChanges, file: ftpResult.file_name, durationMs },
    })

    revalidatePath('/dashboard/settings/suppliers')

    return {
      success: true,
      data: {
        products_updated: updatedProducts,
        products_new: newProducts,
        price_changes: priceChanges,
        file_name: ftpResult.file_name,
      },
    }
  } catch (err) {
    logger.error('Manual LEMU sync failed', { error: err instanceof Error ? err : new Error(String(err)) })
    return { success: false, error: formatError(err, 'LEMU synkronisering fejlede') }
  }
}
