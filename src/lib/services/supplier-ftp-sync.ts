/**
 * Supplier FTP Sync Orchestrator
 *
 * Coordinates FTP download → file parsing → product upsert for
 * suppliers that deliver price catalogs via FTP (AO, Lemvigh-Müller).
 *
 * Flow:
 *   1. Load encrypted FTP credentials from database
 *   2. Connect to supplier FTP server
 *   3. Download the latest matching catalog file
 *   4. Parse CSV through the supplier adapter (SyncEngine)
 *   5. Return parsed rows for the cron job to upsert
 */

import { FtpDownloadService, AO_FTP_CONFIG, LM_FTP_CONFIG } from './ftp-download'
import type { FtpCredentials, FtpDownloadOptions, FtpDownloadResult } from './ftp-download'
import { syncEngine } from './sync-engine'
import type { ParsedRow } from '@/types/suppliers.types'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

export interface FtpSyncResult {
  /** Parsed product rows ready for upsert */
  rows: ParsedRow[]
  /** Name of the downloaded file */
  file_name: string
  /** Raw file size in bytes */
  file_size_bytes: number
  /** When the file was downloaded */
  downloaded_at: string
  /** Time spent on FTP download (ms) */
  download_duration_ms: number
  /** Time spent parsing (ms) */
  parse_duration_ms: number
}

// =====================================================
// FTP Config by Supplier Code
// =====================================================

const FTP_CONFIGS: Record<string, FtpDownloadOptions> = {
  AO: AO_FTP_CONFIG,
  LM: LM_FTP_CONFIG,
}

/**
 * Get the FTP download config for a supplier code.
 * Falls back to AO config if unknown.
 */
function getFtpConfig(supplierCode: string): FtpDownloadOptions {
  return FTP_CONFIGS[supplierCode.toUpperCase()] || AO_FTP_CONFIG
}

// =====================================================
// FTP Sync Orchestrator
// =====================================================

/**
 * Execute a full FTP sync for a supplier:
 *   1. Download latest catalog file from FTP
 *   2. Parse through supplier adapter
 *   3. Return parsed rows
 *
 * @param ftpCredentials - Decrypted FTP credentials (host, username, password)
 * @param supplierCode - Supplier code ('AO' or 'LM')
 * @param configOverrides - Optional overrides for FTP download options
 */
export async function executeFtpSync(
  ftpCredentials: FtpCredentials,
  supplierCode: string,
  configOverrides?: Partial<FtpDownloadOptions>
): Promise<FtpSyncResult> {
  const code = supplierCode.toUpperCase()
  const ftpConfig = { ...getFtpConfig(code), ...configOverrides }

  logger.info(`Starting FTP sync for ${code}`, {
    metadata: {
      host: ftpCredentials.host,
      directory: ftpConfig.remote_directory,
      pattern: ftpConfig.file_pattern,
    },
  })

  // Step 1: Download latest file
  const downloadStart = Date.now()
  const ftpService = new FtpDownloadService(ftpCredentials)
  const downloadResult = await ftpService.downloadLatest(ftpConfig)

  if (!downloadResult) {
    throw new Error(`No matching files found on FTP for ${code} (pattern: ${ftpConfig.file_pattern})`)
  }

  const downloadDuration = Date.now() - downloadStart

  logger.info(`FTP download complete: ${downloadResult.file_name}`, {
    metadata: {
      size_bytes: downloadResult.size_bytes,
      encoding: downloadResult.encoding,
      download_ms: downloadDuration,
    },
  })

  // Step 2: Parse through sync engine (uses the adapter for this supplier)
  const parseStart = Date.now()
  const rows = await syncEngine.processFile(downloadResult.content, code)
  const parseDuration = Date.now() - parseStart

  logger.info(`FTP file parsed: ${rows.length} rows from ${downloadResult.file_name}`, {
    metadata: {
      rows: rows.length,
      parse_ms: parseDuration,
      supplier: code,
    },
  })

  return {
    rows,
    file_name: downloadResult.file_name,
    file_size_bytes: downloadResult.size_bytes,
    downloaded_at: downloadResult.downloaded_at,
    download_duration_ms: downloadDuration,
    parse_duration_ms: parseDuration,
  }
}

/**
 * Build FtpCredentials from decrypted credential input.
 * Maps the generic credential fields to FTP-specific ones.
 *
 * Convention:
 *   - api_endpoint → FTP host (e.g., "ftp.ao.dk" or "ftp.ao.dk:2121")
 *   - username → FTP username
 *   - password → FTP password
 */
export function buildFtpCredentials(
  decryptedCreds: { username?: string; password?: string; api_endpoint?: string },
  supplierCode: string
): FtpCredentials {
  let host = decryptedCreds.api_endpoint || ''
  let port = 21

  // Parse host:port if present
  if (host.includes(':')) {
    const parts = host.split(':')
    host = parts[0]
    const parsed = parseInt(parts[1], 10)
    if (!isNaN(parsed)) port = parsed
  }

  if (!host) {
    throw new Error(`No FTP host configured for supplier ${supplierCode}`)
  }

  if (!decryptedCreds.username || !decryptedCreds.password) {
    throw new Error(`Missing FTP username/password for supplier ${supplierCode}`)
  }

  return {
    host,
    port,
    username: decryptedCreds.username,
    password: decryptedCreds.password,
    secure: false,
    passive: true,
  }
}

/**
 * Test FTP connection for a supplier using stored credentials.
 */
export async function testFtpConnection(
  ftpCredentials: FtpCredentials
): Promise<{ success: boolean; error?: string }> {
  const service = new FtpDownloadService(ftpCredentials)
  return service.testConnection()
}
