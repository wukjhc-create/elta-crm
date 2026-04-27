/**
 * Diagnostic: Test LEMU SFTP connection with detailed output
 * GET /api/admin/test-lemu
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
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

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Get credentials
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id')
      .ilike('code', 'LM')
      .maybeSingle()

    if (!supplier) {
      return NextResponse.json({ error: 'LM supplier not found' })
    }

    const { data: credRow } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    if (!credRow) {
      return NextResponse.json({ error: 'No credentials found' })
    }

    const { decryptCredentials } = await import('@/lib/utils/encryption')
    const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>

    const host = credRow.api_endpoint || decrypted.host || ''
    const username = decrypted.username || ''
    const password = decrypted.password || ''

    const diagnostics: string[] = []
    diagnostics.push(`Host: ${host}`)
    diagnostics.push(`Port: 22`)
    diagnostics.push(`Username: "${username}" (length: ${username.length})`)
    diagnostics.push(`Password length: ${password.length}`)
    diagnostics.push(`Password first 5 chars: ${password.substring(0, 5)}...`)
    diagnostics.push(`Password last 5 chars: ...${password.substring(password.length - 5)}`)
    diagnostics.push(`Password chars: ${[...password].map(c => c.charCodeAt(0)).join(',')}`)

    // Test DNS resolution
    try {
      const dns = await import('dns')
      const { promisify } = await import('util')
      const resolve4 = promisify(dns.resolve4)
      const ips = await resolve4(host)
      diagnostics.push(`DNS resolved: ${ips.join(', ')}`)
    } catch (dnsErr) {
      diagnostics.push(`DNS error: ${dnsErr instanceof Error ? dnsErr.message : String(dnsErr)}`)
    }

    // Test raw SSH connection with debug
    let sshDebugLines: string[] = []
    try {
      const { Client } = await import('ssh2')

      const result = await new Promise<{ success: boolean; error?: string; banner?: string }>((resolve) => {
        const conn = new Client()
        const timeout = setTimeout(() => {
          conn.end()
          resolve({ success: false, error: 'Connection timeout (20s)' })
        }, 20000)

        conn.on('banner', (message: string) => {
          diagnostics.push(`SSH Banner: ${message.trim()}`)
        })

        conn.on('ready', () => {
          clearTimeout(timeout)
          diagnostics.push('SSH connection: READY (authenticated)')

          // Try to open SFTP channel
          conn.sftp((err, sftp) => {
            if (err) {
              conn.end()
              resolve({ success: false, error: `SFTP channel error: ${err.message}` })
              return
            }

            // List /FromLEMU and all subdirectories
            const dirsToCheck = ['/FromLEMU', '/FromLEMU/pricat', '/FromLEMU/invoic', '/FromLEMU/orders']
            let checked = 0
            for (const dir of dirsToCheck) {
              sftp.readdir(dir, (listErr, list) => {
                if (!listErr && list.length > 0) {
                  const files = list
                    .map(f => `${f.filename} (${f.longname.charAt(0) === 'd' ? 'dir' : `${f.attrs.size} bytes`})`)
                    .slice(0, 20)
                    .join(', ')
                  diagnostics.push(`${dir}: ${files}${list.length > 20 ? ` ... +${list.length - 20} more` : ''}`)
                } else if (listErr) {
                  diagnostics.push(`${dir}: ${listErr.message}`)
                }
                checked++
                if (checked === dirsToCheck.length) {
                  conn.end()
                  resolve({ success: true })
                }
              })
            }
          })
        })

        conn.on('error', (err: Error) => {
          clearTimeout(timeout)
          resolve({ success: false, error: err.message })
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(conn as any).on('keyboard-interactive', (_name: string, _instructions: string, _lang: string, _prompts: unknown[], finish: (responses: string[]) => void) => {
          diagnostics.push('Server requested keyboard-interactive auth')
          finish([password])
        })

        conn.connect({
          host,
          port: 22,
          username,
          password,
          tryKeyboard: true,
          readyTimeout: 20000,
          debug: (msg: string) => {
            // Capture auth-related debug lines
            if (msg.includes('Auth') || msg.includes('auth') || msg.includes('password') || msg.includes('keyboard') || msg.includes('handshake') || msg.includes('Handshake')) {
              sshDebugLines.push(msg)
            }
          },
        })
      })

      if (!result.success) {
        diagnostics.push(`SSH error: ${result.error}`)
      }
    } catch (sshErr) {
      diagnostics.push(`SSH exception: ${sshErr instanceof Error ? sshErr.message : String(sshErr)}`)
    }

    // Keep only last 30 debug lines
    sshDebugLines = sshDebugLines.slice(-30)

    return NextResponse.json({
      diagnostics,
      ssh_debug: sshDebugLines,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('LEMU test error', { error: error instanceof Error ? error : new Error(String(error)) })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}
