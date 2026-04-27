/**
 * One-time setup: Create Lemvigh-Müller supplier + SFTP credentials
 * POST /api/admin/setup-lemu
 *
 * Requires CRON_SECRET for authentication.
 * This endpoint is idempotent — it will not duplicate if run multiple times.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    // Verify secret
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

    const body = await request.json() as {
      host: string
      username: string
      password: string
    }

    if (!body.host || !body.username || !body.password) {
      return NextResponse.json({ error: 'Missing host, username, or password' }, { status: 400 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // 1. Find or create LM supplier
    let { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .maybeSingle()

    if (!supplier) {
      const { data: newSupplier, error: insertErr } = await supabase
        .from('suppliers')
        .insert({
          name: 'Lemvigh-Müller',
          code: 'LM',
          is_active: true,
          contact_email: 'kundeservice@lfrp.dk',
          website: 'https://www.lemvigh-mueller.dk',
          notes: 'SFTP prisimport via /FromLEMU/pricelist/',
        })
        .select('id, name, code')
        .single()

      if (insertErr) {
        logger.error('Failed to create LM supplier', { error: insertErr })
        return NextResponse.json({ error: 'Failed to create supplier', detail: insertErr.message }, { status: 500 })
      }
      supplier = newSupplier
    }

    // 2. Create or update supplier_settings
    const { data: existingSettings } = await supabase
      .from('supplier_settings')
      .select('id')
      .eq('supplier_id', supplier.id)
      .maybeSingle()

    if (!existingSettings) {
      await supabase
        .from('supplier_settings')
        .insert({
          supplier_id: supplier.id,
          import_format: 'csv',
          csv_delimiter: ';',
          csv_encoding: 'utf-8',
          adapter_code: 'LM',
          adapter_version: '1.0',
          default_margin_percentage: 25,
          auto_update_prices: true,
          ftp_host: body.host,
          sync_config: {
            protocol: 'sftp',
            port: 22,
            remote_directory: '/FromLEMU/pricelist',
            file_pattern: '*.csv',
          },
        })
    } else {
      await supabase
        .from('supplier_settings')
        .update({
          ftp_host: body.host,
          adapter_code: 'LM',
          auto_update_prices: true,
          sync_config: {
            protocol: 'sftp',
            port: 22,
            remote_directory: '/FromLEMU/pricelist',
            file_pattern: '*.csv',
          },
        })
        .eq('id', existingSettings.id)
    }

    // 3. Encrypt and store SFTP credentials
    const { encryptCredentials } = await import('@/lib/utils/encryption')
    const encrypted = await encryptCredentials({
      username: body.username,
      password: body.password,
      host: body.host,
    })

    // Upsert credential (delete old one if exists)
    await supabase
      .from('supplier_credentials')
      .delete()
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')

    const { error: credErr } = await supabase
      .from('supplier_credentials')
      .insert({
        supplier_id: supplier.id,
        credential_type: 'ftp',
        api_endpoint: body.host,
        credentials_encrypted: encrypted,
        encryption_key_id: 'env:ENCRYPTION_KEY',
        is_active: true,
        environment: 'production',
        notes: `SFTP port 22 — bruger: ${body.username}`,
      })

    if (credErr) {
      logger.error('Failed to store LEMU credentials', { error: credErr })
      return NextResponse.json({ error: 'Failed to store credentials', detail: credErr.message }, { status: 500 })
    }

    // 4. Create sync schedule (weekly Monday 5 AM Copenhagen)
    const { data: existingSchedule } = await supabase
      .from('supplier_sync_schedules')
      .select('id')
      .eq('supplier_id', supplier.id)
      .maybeSingle()

    if (!existingSchedule) {
      await supabase
        .from('supplier_sync_schedules')
        .insert({
          supplier_id: supplier.id,
          schedule_name: 'LEMU ugentlig prisimport',
          sync_type: 'ftp',
          cron_expression: '0 4 * * 1',
          timezone: 'Europe/Copenhagen',
          is_enabled: true,
          max_duration_minutes: 30,
          retry_on_failure: true,
          max_retries: 3,
        })
    }

    logger.info('LEMU setup completed', { metadata: { supplier_id: supplier.id } })

    return NextResponse.json({
      success: true,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      message: 'Lemvigh-Müller SFTP integration configured successfully',
    })
  } catch (error) {
    logger.error('LEMU setup error', { error: error instanceof Error ? error : new Error(String(error)) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
