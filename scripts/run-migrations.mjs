import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim()
  }
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Extract project ref from URL
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

async function executeSql(sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    // RPC doesn't exist, try using postgres directly via Supabase Data API
    return null
  }

  return await response.json()
}

async function runMigrationDirect(sql, filename) {
  console.log(`\nRunning migration: ${filename}`)
  console.log('='.repeat(50))

  // For Supabase, we need to use their Management API or run SQL directly
  // Since we don't have direct DB access, we'll use the postgrest endpoint
  // to check if tables exist first

  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
  })

  console.log(`API Status: ${response.status}`)

  // Try to execute via postgres function if available
  const execResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'GET',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
  })

  console.log(`RPC Status: ${execResponse.status}`)
  console.log('')
  console.log('NOTE: Direct SQL execution requires the Supabase CLI or Dashboard.')
  console.log('Please run the following SQL in your Supabase Dashboard SQL Editor:')
  console.log('')
  console.log('--- BEGIN SQL ---')
  console.log(sql)
  console.log('--- END SQL ---')
  console.log('')
}

async function main() {
  const migrations = [
    '00012_offer_activities.sql',
    '00013_company_settings.sql',
  ]

  console.log('Supabase Migration Runner')
  console.log(`Project: ${projectRef}`)
  console.log(`URL: ${supabaseUrl}`)
  console.log('')

  for (const filename of migrations) {
    const filepath = join(__dirname, '..', 'supabase', 'migrations', filename)
    const sql = readFileSync(filepath, 'utf-8')
    await runMigrationDirect(sql, filename)
  }
}

main().catch(console.error)
