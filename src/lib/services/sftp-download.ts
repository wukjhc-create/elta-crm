/**
 * SFTP Download Service
 *
 * Downloads product catalog files from supplier SFTP servers (SSH-based, port 22).
 * Used for Lemvigh-Müller which uses SFTP instead of plain FTP.
 *
 * Supports:
 * - SFTP (SSH File Transfer Protocol, port 22)
 * - ZIP file extraction (LEMU delivers ZIP containing CSV/TXT)
 * - Optional SOCKS5 proxy for static IP (Vercel → proxy → SFTP)
 * - Auto-retry with exponential backoff
 * - File listing and pattern matching
 * - Encoding-aware download (Windows-1252, UTF-8, etc.)
 */

import SftpClient from 'ssh2-sftp-client'
import { logger } from '@/lib/utils/logger'
import type { FtpDownloadOptions, FtpFileInfo, FtpDownloadResult } from './ftp-download'

// =====================================================
// Types
// =====================================================

export interface SftpCredentials {
  host: string
  port?: number // Default: 22
  username: string
  password: string
}

// =====================================================
// SFTP Download Service
// =====================================================

export class SftpDownloadService {
  private credentials: SftpCredentials

  constructor(credentials: SftpCredentials) {
    this.credentials = {
      ...credentials,
      port: credentials.port || 22,
    }
  }

  /**
   * List files in a remote directory.
   * Optionally filter by glob pattern.
   */
  async listFiles(options: FtpDownloadOptions): Promise<FtpFileInfo[]> {
    const sftp = new SftpClient()

    try {
      await this.connect(sftp, options.timeout_ms)

      const listing = await sftp.list(options.remote_directory)

      let files: FtpFileInfo[] = listing.map(entry => ({
        name: entry.name,
        size: entry.size,
        modified_at: entry.modifyTime ? new Date(entry.modifyTime) : null,
        is_directory: entry.type === 'd',
      }))

      // Filter by pattern
      if (options.file_pattern) {
        const pattern = this.globToRegex(options.file_pattern)
        files = files.filter(f => !f.is_directory && pattern.test(f.name))
      } else {
        files = files.filter(f => !f.is_directory)
      }

      return files.sort((a, b) => {
        const aTime = a.modified_at?.getTime() || 0
        const bTime = b.modified_at?.getTime() || 0
        return bTime - aTime
      })
    } finally {
      await sftp.end()
    }
  }

  /**
   * Download a specific file from the SFTP server.
   * If the file is a ZIP, it will be extracted and the first CSV/TXT returned.
   */
  async downloadFile(
    remotePath: string,
    options: FtpDownloadOptions
  ): Promise<FtpDownloadResult> {
    const encoding = options.encoding || 'utf-8'
    const maxRetries = options.max_retries ?? 2
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const sftp = new SftpClient()

      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
          logger.info(`SFTP download retry ${attempt}/${maxRetries}`, {
            metadata: { file: remotePath, host: this.credentials.host },
          })
        }

        await this.connect(sftp, options.timeout_ms)

        // Download to buffer
        const buffer = await sftp.get(remotePath) as Buffer
        const fileName = remotePath.split('/').pop() || remotePath

        // Handle ZIP files
        if (fileName.toLowerCase().endsWith('.zip')) {
          logger.info(`Extracting ZIP file: ${fileName}`, {
            metadata: { size: buffer.length },
          })

          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(buffer)
          const entries = Object.keys(zip.files)

          // Find first CSV or TXT file inside the ZIP
          const csvEntry = entries.find(e =>
            e.toLowerCase().endsWith('.csv') ||
            e.toLowerCase().endsWith('.txt')
          )

          if (!csvEntry) {
            throw new Error(`ZIP file ${fileName} contains no CSV/TXT files. Contents: ${entries.join(', ')}`)
          }

          // Extract as binary buffer first, then decode
          const csvBuffer = await zip.file(csvEntry)!.async('nodebuffer')

          // Decode with correct encoding (LEMU uses Windows-1252)
          let content: string
          if (encoding === 'latin1' || encoding === 'binary' || (encoding as string) === 'win1252' || (encoding as string) === 'windows-1252') {
            // Node's 'latin1' encoding handles Windows-1252 characters
            content = csvBuffer.toString('latin1')
          } else {
            content = csvBuffer.toString(encoding as BufferEncoding)
          }

          logger.info(`Extracted ${csvEntry} from ZIP (${csvBuffer.length} bytes, ${encoding})`)

          return {
            file_name: csvEntry,
            content,
            size_bytes: csvBuffer.length,
            downloaded_at: new Date().toISOString(),
            encoding,
          }
        }

        // Regular (non-ZIP) file
        const content = buffer.toString(encoding as BufferEncoding)

        return {
          file_name: fileName,
          content,
          size_bytes: buffer.length,
          downloaded_at: new Date().toISOString(),
          encoding,
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        logger.warn(`SFTP download attempt ${attempt + 1} failed`, {
          error: lastError,
          metadata: { file: remotePath, host: this.credentials.host },
        })
      } finally {
        await sftp.end().catch(() => {})
      }
    }

    throw lastError || new Error('SFTP download failed after all retries')
  }

  /**
   * Download the latest matching file from a directory.
   */
  async downloadLatest(options: FtpDownloadOptions): Promise<FtpDownloadResult | null> {
    const files = await this.listFiles(options)

    if (files.length === 0) {
      logger.info('No matching files found on SFTP', {
        metadata: {
          host: this.credentials.host,
          directory: options.remote_directory,
          pattern: options.file_pattern,
        },
      })
      return null
    }

    const latest = files[0]
    const remotePath = `${options.remote_directory}/${latest.name}`.replace(/\/\//g, '/')

    logger.info(`Downloading latest SFTP file: ${latest.name}`, {
      metadata: {
        size: latest.size,
        modified: latest.modified_at?.toISOString(),
        host: this.credentials.host,
      },
    })

    return this.downloadFile(remotePath, options)
  }

  /**
   * Test SFTP connection.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const sftp = new SftpClient()

    try {
      await this.connect(sftp, 10000)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    } finally {
      await sftp.end().catch(() => {})
    }
  }

  // =====================================================
  // Private Helpers
  // =====================================================

  private async connect(sftp: SftpClient, timeoutMs?: number): Promise<void> {
    const connectConfig: SftpClient.ConnectOptions = {
      host: this.credentials.host,
      port: this.credentials.port || 22,
      username: this.credentials.username,
      password: this.credentials.password,
      readyTimeout: timeoutMs || 15000,
      retries: 0,
      tryKeyboard: true,
    }

    // Support SOCKS5 proxy for static IP (e.g., QuotaGuard)
    const proxyUrl = process.env.SFTP_PROXY_URL
    if (proxyUrl) {
      try {
        const { SocksClient } = await import('socks')
        const url = new URL(proxyUrl)

        const sockConn = await SocksClient.createConnection({
          proxy: {
            host: url.hostname,
            port: parseInt(url.port) || 1080,
            type: 5,
            userId: url.username || undefined,
            password: url.password || undefined,
          },
          command: 'connect',
          destination: {
            host: this.credentials.host,
            port: this.credentials.port || 22,
          },
          timeout: timeoutMs || 15000,
        })

        connectConfig.sock = sockConn.socket
      } catch (proxyErr) {
        logger.warn('SFTP proxy connection failed, trying direct', {
          error: proxyErr instanceof Error ? proxyErr : new Error(String(proxyErr)),
          metadata: { proxy: proxyUrl },
        })
      }
    }

    await sftp.connect(connectConfig)
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
// LEMU SFTP Configuration
// =====================================================

/**
 * Lemvigh-Müller SFTP config.
 * Files: /FromLEMU/LM_CSV_Standard_*.zip (contains .txt CSV)
 * Format: semicolon-delimited, quoted, Windows-1252 encoding
 */
export const LEMU_SFTP_CONFIG: FtpDownloadOptions = {
  remote_directory: '/FromLEMU/pricat',
  file_pattern: 'LM_CSV_Standard_*.zip',
  encoding: 'latin1', // Windows-1252 compatible
  timeout_ms: 60000, // Large file, allow 60s
  max_retries: 2,
}
