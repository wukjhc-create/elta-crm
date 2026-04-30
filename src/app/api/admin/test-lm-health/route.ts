/**
 * LM (Lemvigh-Müller) FTP/SFTP health check.
 *
 * GET /api/admin/test-lm-health
 *
 * - Runs the existing FTP/SFTP test against the active LM credential.
 * - On success: marks last_test_status='success' and returns 200.
 * - On failure:
 *     · logs the error clearly,
 *     · sets last_test_status='failed' + last_test_error,
 *     · flips is_active=false on the credential (disables nightly sync
 *       until an operator re-enables it from the UI).
 *
 * Auth: Bearer CRON_SECRET — same pattern as the other admin diagnostics
 * endpoints in this app.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // ---- auth ----
    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // ---- locate LM ftp credential ----
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, code')
      .ilike('code', 'LM')
      .maybeSingle()
    if (!supplier) {
      return NextResponse.json({ error: 'LM supplier row not found' }, { status: 404 })
    }

    const { data: cred } = await supabase
      .from('supplier_credentials')
      .select('id, credentials_encrypted, api_endpoint, is_active')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .maybeSingle()
    if (!cred) {
      return NextResponse.json({ error: 'LM FTP credential not found' }, { status: 404 })
    }

    // ---- decrypt + build creds + test ----
    const { decryptCredentials } = await import('@/lib/utils/encryption')
    const { buildFtpCredentials, testFtpConnection } = await import(
      '@/lib/services/supplier-ftp-sync'
    )

    const decrypted = (await decryptCredentials(cred.credentials_encrypted)) as Record<
      string,
      string
    >

    const ftpCreds = buildFtpCredentials(
      {
        username: decrypted.username,
        password: decrypted.password,
        api_endpoint: cred.api_endpoint || undefined,
        host: decrypted.host,
      },
      supplier.code?.toUpperCase() || 'LM'
    )

    const result = await testFtpConnection(ftpCreds, supplier.code?.toUpperCase() || 'LM')
    const nowIso = new Date().toISOString()

    if (result.success) {
      await supabase
        .from('supplier_credentials')
        .update({
          last_test_at: nowIso,
          last_test_status: 'success',
          last_test_error: null,
        })
        .eq('id', cred.id)

      console.log('LM HEALTH OK')
      return NextResponse.json({
        ok: true,
        supplier: supplier.code,
        credential_id: cred.id,
        is_active: cred.is_active,
        tested_at: nowIso,
      })
    }

    // ---- failure path: log, mark failed, disable ----
    const errMsg = result.error || 'Unknown FTP/SFTP failure'
    logger.error('LM FTP/SFTP health-check FAILED — disabling sync', {
      entity: 'supplier_credentials',
      entityId: cred.id,
      metadata: { supplier: supplier.code, host: ftpCreds.host, port: ftpCreds.port },
      error: new Error(errMsg),
    })
    console.error('LM HEALTH FAIL — DISABLING:', errMsg)

    const { error: updErr } = await supabase
      .from('supplier_credentials')
      .update({
        last_test_at: nowIso,
        last_test_status: 'failed',
        last_test_error: errMsg,
        is_active: false,
      })
      .eq('id', cred.id)
    if (updErr) {
      logger.error('Failed to disable LM credential after health failure', {
        entityId: cred.id,
        error: updErr,
      })
    }

    return NextResponse.json(
      {
        ok: false,
        supplier: supplier.code,
        credential_id: cred.id,
        is_active: false,
        disabled: true,
        error: errMsg,
        tested_at: nowIso,
      },
      { status: 502 }
    )
  } catch (err) {
    logger.error('test-lm-health threw', {
      error: err instanceof Error ? err : new Error(String(err)),
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
