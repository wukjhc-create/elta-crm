'use server'

/**
 * Server Actions — Lemvigh-Müller SFTP Price Sync
 *
 * Provides manual trigger and status for the LEMU price import.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
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
    // Bruger service-role til SFTP-credentials (R3) -> kræver settings.suppliers (admin), som credential-administrationen.
    const { supabase, requirePermission } = await getAuthenticatedClientWithRole()
    requirePermission('settings.suppliers')

    // Find LM supplier
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .maybeSingle()

    if (!supplier) {
      return { success: false, error: 'Lemvigh-Müller leverandør ikke fundet i systemet. Opret den først under Indstillinger → Leverandører.' }
    }

    // FTP-credentials hentes og dekrypteres server-side (service-role, R3) — brugerklienten kan ikke læse dem.
    const { loadDecryptedSupplierCredentials } = await import('@/lib/services/supplier-credential-secrets')
    const credResult = await loadDecryptedSupplierCredentials(supplier.id, 'ftp')
    if (!credResult.success || !credResult.data) {
      return { success: false, error: 'Ingen SFTP-loginoplysninger konfigureret for Lemvigh-Müller.' }
    }
    const credRow = { api_endpoint: credResult.data.api_endpoint ?? null }
    const decrypted = credResult.data as Record<string, string>

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

    // SU-1 (review 2026-10-17): samme bulk-anvendelse som cronen (før rækkevis update/insert — kunne ikke blive færdig
    // på ~300.000 varer, oprettede 0-kr-varer, nulstillede kategori/EAN og skrev historik for fejlede rækker)
    const { applyLemuRows } = await import('@/lib/suppliers/lemu-apply')
    // 00192: kostkolonner og systemdata — admin-klient bag settings.suppliers (admin)
    const applied = await applyLemuRows(createAdminClient(), supplier.id, ftpResult.rows, { existingBudgetMs: 120_000, logLabel: 'LEMU manuel' })
    const { newProducts, updatedProducts, priceChanges } = applied
    const now = new Date().toISOString()

    const durationMs = Date.now() - syncStart

    // Create sync log
    await supabase.from('supplier_sync_logs').insert({
      supplier_id: supplier.id,
      job_type: 'ftp',
      status: applied.errors.length === 0 ? 'completed' : 'failed', // 'partial' findes ikke i CHECK (00043)
      trigger_type: 'manual',
      started_at: new Date(syncStart).toISOString(),
      completed_at: now,
      duration_ms: durationMs,
      total_items: ftpResult.rows.length,
      processed_items: updatedProducts + newProducts,
      new_items: newProducts,
      updated_items: updatedProducts,
      price_changes_count: priceChanges,
      error_message: applied.errors.length > 0 ? applied.errors.join('; ') : null,
      details: { file_name: ftpResult.file_name, file_size: ftpResult.file_size_bytes, total_parsed: applied.totalParsed, deduplicated: applied.deduplicated, skipped_no_cost: applied.skippedNoCost, existing_loaded: applied.existingLoaded, existing_total: applied.existingTotal },
    })

    // Update schedule if exists
    await supabase
      .from('supplier_sync_schedules')
      .update({
        last_run_at: now,
        last_run_status: applied.errors.length === 0 ? 'success' : 'partial',
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
