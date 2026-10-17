/**
 * Cron Job: Lemvigh-Müller Weekly Price Sync
 *
 * Connects to LEMU SFTP (port 22), downloads the latest CSV price file
 * from /FromLEMU/pricat/, and upserts products into supplier_products.
 *
 * Schedule: Weekly on Monday at 4 AM UTC (5 AM Copenhagen)
 * Config: vercel.json crons section
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeFtpSync, buildFtpCredentials } from '@/lib/services/supplier-ftp-sync'
import { decryptCredentials } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'
import { applyLemuRows } from '@/lib/suppliers/lemu-apply'
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

const CRON_SECRET = process.env.CRON_SECRET

async function handleCron(request: Request): Promise<Response> {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()
    const supabase = createAdminClient()

    // Find LM supplier
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .eq('is_active', true)
      .maybeSingle()

    if (!supplier) {
      return NextResponse.json({
        message: 'Lemvigh-Müller supplier not found or inactive',
        timestamp: new Date().toISOString(),
      })
    }

    // Get SFTP credentials
    const { data: credRow, error: credError } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    if (credError || !credRow) {
      logger.warn('LEMU cron: No SFTP credentials configured')
      return NextResponse.json({
        message: 'No SFTP credentials configured for Lemvigh-Müller',
        timestamp: new Date().toISOString(),
      })
    }

    // Decrypt and build credentials
    const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>
    const creds = buildFtpCredentials(
      { username: decrypted.username, password: decrypted.password, api_endpoint: credRow.api_endpoint || undefined, host: decrypted.host },
      'LM'
    )

    // Execute SFTP sync (download + parse)
    const ftpResult = await executeFtpSync(creds, 'LM')

    // SU-1 (review 2026-10-17): fælles anvendelse med den manuelle synk (lib/suppliers/lemu-apply.ts)
    if (!ftpResult.rows.some((r) => r.parsed.sku && r.errors.length === 0)) {
      await supabase.from('supplier_sync_logs').insert({
        supplier_id: supplier.id,
        job_type: 'ftp',
        status: 'completed',
        trigger_type: 'scheduled',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        total_items: ftpResult.rows.length,
        processed_items: 0,
        details: { file_name: ftpResult.file_name, total_parsed: ftpResult.rows.length, note: 'No valid rows after parsing' },
      })
      return NextResponse.json({ message: 'No valid rows in CSV', file: ftpResult.file_name })
    }

    const applied = await applyLemuRows(supabase, supplier.id, ftpResult.rows, { existingBudgetMs: 60_000, logLabel: 'LEMU cron' })
    const { newProducts, updatedProducts, priceChanges, errors, skippedNoCost, totalParsed } = applied
    const deduplicatedCount = applied.deduplicated
    const now = new Date().toISOString()

    const durationMs = Date.now() - startTime
    const status = errors.length === 0 ? 'success' : 'partial'

    // Update schedule + create log
    await Promise.all([
      supabase.from('supplier_sync_schedules')
        .update({
          last_run_at: now,
          last_run_status: status,
          last_run_duration_ms: durationMs,
          last_run_items_processed: updatedProducts + newProducts,
        })
        .eq('supplier_id', supplier.id),
      supabase.from('supplier_sync_logs').insert({
        supplier_id: supplier.id,
        job_type: 'ftp',
        // X4: 'partial' findes ikke i CHECK (00043) → indsættelsen fejlede og fejlkørsler efterlod ingen log
        status: status === 'success' ? 'completed' : 'failed',
        trigger_type: 'scheduled',
        started_at: new Date(startTime).toISOString(),
        completed_at: now,
        duration_ms: durationMs,
        total_items: deduplicatedCount,
        processed_items: updatedProducts + newProducts,
        new_items: newProducts,
        updated_items: updatedProducts,
        price_changes_count: priceChanges,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        details: { file_name: ftpResult.file_name, file_size: ftpResult.file_size_bytes, total_parsed: totalParsed, deduplicated: deduplicatedCount, partial: errors.length > 0, existing_loaded: applied.existingLoaded, existing_total: applied.existingTotal, existing_ms: applied.existingMs, skipped_no_cost: skippedNoCost },
      }),
    ])

    logger.info('LEMU cron sync completed', {
      duration: durationMs,
      metadata: { updated: updatedProducts, new: newProducts, priceChanges, file: ftpResult.file_name },
    })

    return NextResponse.json({
      message: 'LEMU sync completed',
      timestamp: now,
      durationMs,
      file: ftpResult.file_name,
      updated: updatedProducts,
      new: newProducts,
      priceChanges,
      totalParsed,
      deduplicated: deduplicatedCount,
      skippedNoCost, // SU-2: nye varer uden kostpris oprettes ikke
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    logger.error('LEMU cron job error', { error: error instanceof Error ? error : new Error(String(error)) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('lemu-sync', handleCron)
