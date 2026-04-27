/**
 * Supplier FTP/SFTP Sync Orchestrator
 *
 * Coordinates file download → CSV parsing → product upsert for
 * suppliers that deliver price catalogs via FTP or SFTP.
 *
 * Supports:
 * - Plain FTP (port 21) via basic-ftp — used by AO
 * - SFTP (port 22, SSH-based) via ssh2-sftp-client — used by Lemvigh-Müller
 *
 * Flow:
 *   1. Load encrypted credentials from database
 *   2. Connect to supplier FTP/SFTP server
 *   3. Download the latest matching catalog file
 *   4. Parse CSV through the supplier adapter (SyncEngine)
 *   5. Return parsed rows for the cron job to upsert
 */

import { FtpDownloadService, AO_FTP_CONFIG, LM_FTP_CONFIG } from './ftp-download'
import { SftpDownloadService, LEMU_SFTP_CONFIG } from './sftp-download'
import type { FtpCredentials, FtpDownloadOptions, FtpDownloadResult } from './ftp-download'
import type { SftpCredentials } from './sftp-download'
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
  /** Time spent on download (ms) */
  download_duration_ms: number
  /** Time spent parsing (ms) */
  parse_duration_ms: number
}

// =====================================================
// Config by Supplier Code
// =====================================================

const FTP_CONFIGS: Record<string, FtpDownloadOptions> = {
  AO: AO_FTP_CONFIG,
  LM: LM_FTP_CONFIG,
}

/** Suppliers that use SFTP (SSH port 22) instead of plain FTP */
const SFTP_SUPPLIERS = new Set(['LM'])

function getFtpConfig(supplierCode: string): FtpDownloadOptions {
  const code = supplierCode.toUpperCase()
  // For SFTP suppliers, prefer the SFTP config
  if (SFTP_SUPPLIERS.has(code)) {
    return LEMU_SFTP_CONFIG
  }
  return FTP_CONFIGS[code] || AO_FTP_CONFIG
}

function usesSftp(supplierCode: string): boolean {
  return SFTP_SUPPLIERS.has(supplierCode.toUpperCase())
}

// =====================================================
// Sync Orchestrator
// =====================================================

/**
 * Execute a full FTP/SFTP sync for a supplier:
 *   1. Download latest catalog file
 *   2. Parse through supplier adapter
 *   3. Return parsed rows
 */
export async function executeFtpSync(
  ftpCredentials: FtpCredentials | SftpCredentials,
  supplierCode: string,
  configOverrides?: Partial<FtpDownloadOptions>
): Promise<FtpSyncResult> {
  const code = supplierCode.toUpperCase()
  const config = { ...getFtpConfig(code), ...configOverrides }
  const isSftp = usesSftp(code)
  const protocol = isSftp ? 'SFTP' : 'FTP'

  logger.info(`Starting ${protocol} sync for ${code}`, {
    metadata: {
      host: ftpCredentials.host,
      directory: config.remote_directory,
      pattern: config.file_pattern,
      protocol,
    },
  })

  // Step 1: Download latest file (SFTP or FTP)
  const downloadStart = Date.now()
  let downloadResult: FtpDownloadResult | null

  if (isSftp) {
    const sftpService = new SftpDownloadService(ftpCredentials as SftpCredentials)
    downloadResult = await sftpService.downloadLatest(config)
  } else {
    const ftpService = new FtpDownloadService(ftpCredentials as FtpCredentials)
    downloadResult = await ftpService.downloadLatest(config)
  }

  if (!downloadResult) {
    throw new Error(`No matching files found on ${protocol} for ${code} (pattern: ${config.file_pattern})`)
  }

  const downloadDuration = Date.now() - downloadStart

  logger.info(`${protocol} download complete: ${downloadResult.file_name}`, {
    metadata: {
      size_bytes: downloadResult.size_bytes,
      encoding: downloadResult.encoding,
      download_ms: downloadDuration,
    },
  })

  // Step 2: Parse through sync engine
  const parseStart = Date.now()
  const rows = await syncEngine.processFile(downloadResult.content, code)
  const parseDuration = Date.now() - parseStart

  logger.info(`${protocol} file parsed: ${rows.length} rows from ${downloadResult.file_name}`, {
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
 * Build credentials from decrypted input.
 * Returns FtpCredentials (port 21) or SftpCredentials (port 22) based on supplier.
 */
export function buildFtpCredentials(
  decryptedCreds: { username?: string; password?: string; api_endpoint?: string; host?: string },
  supplierCode: string
): FtpCredentials | SftpCredentials {
  let host = decryptedCreds.api_endpoint || decryptedCreds.host || ''
  const isSftp = usesSftp(supplierCode)
  let port = isSftp ? 22 : 21

  // Parse host:port if present
  if (host.includes(':')) {
    const parts = host.split(':')
    host = parts[0]
    const parsed = parseInt(parts[1], 10)
    if (!isNaN(parsed)) port = parsed
  }

  if (!host) {
    throw new Error(
      `No ${isSftp ? 'SFTP' : 'FTP'} host configured for supplier ${supplierCode}. ` +
      `Go to Settings → Suppliers → ${supplierCode} → FTP Login and enter the host.`
    )
  }

  if (!decryptedCreds.username || !decryptedCreds.password) {
    throw new Error(`Missing ${isSftp ? 'SFTP' : 'FTP'} username/password for supplier ${supplierCode}`)
  }

  if (isSftp) {
    return {
      host,
      port,
      username: decryptedCreds.username,
      password: decryptedCreds.password,
    } satisfies SftpCredentials
  }

  return {
    host,
    port,
    username: decryptedCreds.username,
    password: decryptedCreds.password,
    secure: false,
    passive: true,
  } satisfies FtpCredentials
}

/**
 * Test connection for a supplier (FTP or SFTP).
 */
export async function testFtpConnection(
  credentials: FtpCredentials | SftpCredentials,
  supplierCode?: string
): Promise<{ success: boolean; error?: string }> {
  const isSftp = supplierCode ? usesSftp(supplierCode) : (credentials.port === 22)

  if (isSftp) {
    const service = new SftpDownloadService(credentials as SftpCredentials)
    return service.testConnection()
  }

  const service = new FtpDownloadService(credentials as FtpCredentials)
  return service.testConnection()
}
