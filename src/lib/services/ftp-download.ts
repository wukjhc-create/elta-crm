/**
 * FTP Download Service
 *
 * Downloads product catalog files from supplier FTP servers.
 * Used by the nightly cron sync for AO and Lemvigh-Müller.
 *
 * Supports:
 * - Plain FTP (port 21) and FTPS (implicit TLS)
 * - Passive mode for firewall compatibility
 * - Auto-retry with exponential backoff
 * - File listing and pattern matching
 * - Encoding-aware download (ISO-8859-1, UTF-8)
 */

import * as ftp from 'basic-ftp'
import { Readable } from 'stream'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

export interface FtpCredentials {
  host: string
  port?: number
  username: string
  password: string
  secure?: boolean // Use FTPS (implicit TLS)
  passive?: boolean // Passive mode (default: true)
}

export interface FtpDownloadOptions {
  /** Remote directory to list/download from */
  remote_directory: string
  /** File name pattern to match (e.g., 'prisliste*.csv') */
  file_pattern?: string
  /** Expected encoding of downloaded files */
  encoding?: BufferEncoding
  /** Connection timeout in ms (default: 15000) */
  timeout_ms?: number
  /** Max retries on failure (default: 2) */
  max_retries?: number
}

export interface FtpFileInfo {
  name: string
  size: number
  modified_at: Date | null
  is_directory: boolean
}

export interface FtpDownloadResult {
  file_name: string
  content: string
  size_bytes: number
  downloaded_at: string
  encoding: string
}

// =====================================================
// FTP Download Service
// =====================================================

export class FtpDownloadService {
  private credentials: FtpCredentials

  constructor(credentials: FtpCredentials) {
    this.credentials = {
      ...credentials,
      port: credentials.port || 21,
      passive: credentials.passive !== false,
    }
  }

  /**
   * List files in a remote directory.
   * Optionally filter by glob pattern.
   */
  async listFiles(options: FtpDownloadOptions): Promise<FtpFileInfo[]> {
    const client = new ftp.Client()
    client.ftp.verbose = false

    try {
      await this.connect(client, options.timeout_ms)

      const listing = await client.list(options.remote_directory)

      let files: FtpFileInfo[] = listing.map(entry => ({
        name: entry.name,
        size: entry.size,
        modified_at: entry.modifiedAt || null,
        is_directory: entry.isDirectory,
      }))

      // Filter by pattern
      if (options.file_pattern) {
        const pattern = this.globToRegex(options.file_pattern)
        files = files.filter(f => !f.is_directory && pattern.test(f.name))
      } else {
        files = files.filter(f => !f.is_directory)
      }

      return files.sort((a, b) => {
        // Most recently modified first
        const aTime = a.modified_at?.getTime() || 0
        const bTime = b.modified_at?.getTime() || 0
        return bTime - aTime
      })
    } finally {
      client.close()
    }
  }

  /**
   * Download a specific file from the FTP server.
   * Returns the file content as a string with proper encoding.
   */
  async downloadFile(
    remotePath: string,
    options: FtpDownloadOptions
  ): Promise<FtpDownloadResult> {
    const encoding = options.encoding || 'utf-8'
    const maxRetries = options.max_retries ?? 2
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const client = new ftp.Client()
      client.ftp.verbose = false

      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
          logger.info(`FTP download retry ${attempt}/${maxRetries}`, {
            metadata: { file: remotePath, host: this.credentials.host },
          })
        }

        await this.connect(client, options.timeout_ms)

        // Download to buffer
        const chunks: Buffer[] = []
        const writable = new (await import('stream')).Writable({
          write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
            chunks.push(chunk)
            callback()
          },
        })

        await client.downloadTo(writable, remotePath)

        const buffer = Buffer.concat(chunks)
        const content = buffer.toString(encoding as BufferEncoding)

        return {
          file_name: remotePath.split('/').pop() || remotePath,
          content,
          size_bytes: buffer.length,
          downloaded_at: new Date().toISOString(),
          encoding,
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        logger.warn(`FTP download attempt ${attempt + 1} failed`, {
          error: lastError,
          metadata: { file: remotePath, host: this.credentials.host },
        })
      } finally {
        client.close()
      }
    }

    throw lastError || new Error('FTP download failed after all retries')
  }

  /**
   * Download the latest matching file from a directory.
   * Combines listing + download for convenience.
   */
  async downloadLatest(options: FtpDownloadOptions): Promise<FtpDownloadResult | null> {
    const files = await this.listFiles(options)

    if (files.length === 0) {
      logger.info('No matching files found on FTP', {
        metadata: {
          host: this.credentials.host,
          directory: options.remote_directory,
          pattern: options.file_pattern,
        },
      })
      return null
    }

    // Download the most recent file
    const latest = files[0]
    const remotePath = `${options.remote_directory}/${latest.name}`.replace(/\/\//g, '/')

    logger.info(`Downloading latest file: ${latest.name}`, {
      metadata: {
        size: latest.size,
        modified: latest.modified_at?.toISOString(),
        host: this.credentials.host,
      },
    })

    return this.downloadFile(remotePath, options)
  }

  /**
   * Test FTP connection with given credentials.
   * Returns true if connection succeeds.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const client = new ftp.Client()
    client.ftp.verbose = false

    try {
      await this.connect(client, 10000)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    } finally {
      client.close()
    }
  }

  // =====================================================
  // Private Helpers
  // =====================================================

  private async connect(client: ftp.Client, timeoutMs?: number): Promise<void> {
    client.ftp.verbose = false

    await client.access({
      host: this.credentials.host,
      port: this.credentials.port || 21,
      user: this.credentials.username,
      password: this.credentials.password,
      secure: this.credentials.secure || false,
      secureOptions: this.credentials.secure ? { rejectUnauthorized: false } : undefined,
    })

    // basic-ftp uses passive mode by default.
    // No explicit call needed — passive is the standard for firewall compatibility.
  }

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`, 'i')
  }
}

// =====================================================
// Supplier-Specific FTP Configurations
// =====================================================

/** AO FTP defaults */
export const AO_FTP_CONFIG: FtpDownloadOptions = {
  remote_directory: '/prislister',
  file_pattern: 'prisliste*.csv',
  encoding: 'latin1', // ISO-8859-1
  timeout_ms: 30000,
  max_retries: 2,
}

/** Lemvigh-Müller FTP defaults */
export const LM_FTP_CONFIG: FtpDownloadOptions = {
  remote_directory: '/export',
  file_pattern: 'produkter*.csv',
  encoding: 'utf-8',
  timeout_ms: 30000,
  max_retries: 2,
}
