/**
 * Test Microsoft Graph API Connection
 *
 * Validates Azure credentials and mailbox access for the Mail Bridge.
 * Run with:  npx tsx scripts/test-graph-connection.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (no dotenv dependency needed)
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.substring(0, eqIndex).trim()
      const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env.local not found — rely on shell env
  }
}
loadEnvLocal()

// =====================================================
// Configuration
// =====================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

const ENV_VARS = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'GRAPH_MAILBOX',
] as const

// =====================================================
// Helpers
// =====================================================

function log(icon: string, msg: string) {
  console.log(`  ${icon}  ${msg}`)
}

function header(title: string) {
  console.log()
  console.log(`--- ${title} ---`)
}

// =====================================================
// Step 1: Check env vars
// =====================================================

function checkEnvVars(): boolean {
  header('1. Environment Variables')
  let allPresent = true

  for (const key of ENV_VARS) {
    const value = process.env[key]
    if (!value) {
      if (key === 'GRAPH_MAILBOX') {
        log('~', `${key} = (not set, will default to crm@eltasolar.dk)`)
      } else {
        log('X', `${key} = MISSING`)
        allPresent = false
      }
    } else {
      const masked = value.length > 8
        ? value.substring(0, 4) + '****' + value.substring(value.length - 4)
        : '****'
      log('OK', `${key} = ${masked}`)
    }
  }

  return allPresent
}

// =====================================================
// Step 2: Acquire OAuth2 token
// =====================================================

async function acquireToken(): Promise<string | null> {
  header('2. OAuth2 Token Acquisition')

  const tenantId = process.env.AZURE_TENANT_ID!
  const clientId = process.env.AZURE_CLIENT_ID!
  const clientSecret = process.env.AZURE_CLIENT_SECRET!

  const tokenUrl = TOKEN_ENDPOINT.replace('{tenant}', tenantId)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: 'client_credentials',
  })

  try {
    const startMs = Date.now()
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const durationMs = Date.now() - startMs

    if (!response.ok) {
      const errorBody = await response.text()
      log('X', `Token request failed: HTTP ${response.status}`)
      log('X', `Response: ${errorBody.substring(0, 300)}`)

      if (response.status === 401) {
        log('!', 'Hint: Check AZURE_CLIENT_SECRET — it may be expired.')
      }
      if (response.status === 400) {
        log('!', 'Hint: Check AZURE_TENANT_ID and AZURE_CLIENT_ID.')
      }

      return null
    }

    const data = await response.json()
    const expiresIn = data.expires_in || 'unknown'
    log('OK', `Token acquired in ${durationMs}ms (expires in ${expiresIn}s)`)
    return data.access_token
  } catch (err) {
    log('X', `Network error: ${err instanceof Error ? err.message : String(err)}`)
    log('!', 'Hint: Check your internet connection and firewall settings.')
    return null
  }
}

// =====================================================
// Step 3: Test mailbox access
// =====================================================

async function testMailboxAccess(token: string): Promise<boolean> {
  header('3. Mailbox Access')

  const mailbox = process.env.GRAPH_MAILBOX || 'crm@eltasolar.dk'
  log('>', `Testing mailbox: ${mailbox}`)

  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount`

  try {
    const startMs = Date.now()
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const durationMs = Date.now() - startMs

    if (!response.ok) {
      const errorBody = await response.text()
      log('X', `Mailbox access failed: HTTP ${response.status} (${durationMs}ms)`)
      log('X', `Response: ${errorBody.substring(0, 300)}`)

      if (response.status === 403) {
        log('!', 'Hint: App registration needs Mail.Read permission for this mailbox.')
        log('!', 'In Azure AD: API Permissions > Add > Microsoft Graph > Application > Mail.Read')
      }
      if (response.status === 404) {
        log('!', `Hint: Mailbox "${mailbox}" not found. Check GRAPH_MAILBOX env var.`)
      }

      return false
    }

    const data = await response.json()
    log('OK', `Inbox accessible (${durationMs}ms)`)
    log('OK', `  Folder: ${data.displayName}`)
    log('OK', `  Total emails: ${data.totalItemCount}`)
    log('OK', `  Unread: ${data.unreadItemCount}`)

    return true
  } catch (err) {
    log('X', `Network error: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

// =====================================================
// Step 4: Test delta query (incremental sync)
// =====================================================

async function testDeltaQuery(token: string): Promise<boolean> {
  header('4. Delta Query (Incremental Sync)')

  const mailbox = process.env.GRAPH_MAILBOX || 'crm@eltasolar.dk'
  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=id,subject,from,receivedDateTime&$top=3`

  try {
    const startMs = Date.now()
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="html"',
      },
    })
    const durationMs = Date.now() - startMs

    if (!response.ok) {
      const errorBody = await response.text()
      log('X', `Delta query failed: HTTP ${response.status} (${durationMs}ms)`)
      log('X', `Response: ${errorBody.substring(0, 200)}`)
      return false
    }

    const data = await response.json()
    const messages = data.value || []
    const hasDelta = !!data['@odata.deltaLink']
    const hasNext = !!data['@odata.nextLink']

    log('OK', `Delta query successful (${durationMs}ms)`)
    log('OK', `  Messages returned: ${messages.length}`)
    log('OK', `  Has deltaLink: ${hasDelta}`)
    log('OK', `  Has nextLink: ${hasNext}`)

    if (messages.length > 0) {
      const latest = messages[0]
      const from = latest.from?.emailAddress?.address || 'unknown'
      const subject = (latest.subject || '(no subject)').substring(0, 60)
      log('OK', `  Latest: "${subject}" from ${from}`)
    }

    return true
  } catch (err) {
    log('X', `Error: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

// =====================================================
// Main
// =====================================================

async function main() {
  console.log('============================================')
  console.log('  Elta Solar — Graph API Connection Test')
  console.log('============================================')

  // Step 1
  const envOk = checkEnvVars()
  if (!envOk) {
    header('RESULT')
    log('X', 'FAILED: Missing required environment variables.')
    log('!', 'Add them to .env.local:')
    log('!', '  AZURE_TENANT_ID=your-tenant-id')
    log('!', '  AZURE_CLIENT_ID=your-client-id')
    log('!', '  AZURE_CLIENT_SECRET=your-client-secret')
    log('!', '  GRAPH_MAILBOX=crm@eltasolar.dk')
    process.exit(1)
  }

  // Step 2
  const token = await acquireToken()
  if (!token) {
    header('RESULT')
    log('X', 'FAILED: Could not acquire OAuth2 token.')
    process.exit(1)
  }

  // Step 3
  const mailboxOk = await testMailboxAccess(token)
  if (!mailboxOk) {
    header('RESULT')
    log('X', 'FAILED: Could not access mailbox.')
    process.exit(1)
  }

  // Step 4
  const deltaOk = await testDeltaQuery(token)

  // Summary
  header('RESULT')
  if (mailboxOk && deltaOk) {
    log('OK', 'ALL TESTS PASSED — Mail Bridge is ready!')
    log('OK', 'The cron job at /api/cron/email-sync should work correctly.')
  } else if (mailboxOk) {
    log('~', 'PARTIAL: Mailbox accessible, but delta query failed.')
    log('!', 'The basic connection works. Delta issues may resolve on retry.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
