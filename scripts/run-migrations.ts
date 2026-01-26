import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function runMigration(filename: string) {
  const filepath = path.join(__dirname, '..', 'supabase', 'migrations', filename)

  if (!fs.existsSync(filepath)) {
    console.error(`Migration file not found: ${filepath}`)
    return false
  }

  const sql = fs.readFileSync(filepath, 'utf-8')

  console.log(`\nRunning migration: ${filename}`)
  console.log('=' .repeat(50))

  // Split by semicolon and filter empty statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    if (!statement) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })

      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: queryError } = await supabase.from('_migrations_temp').select().limit(0)
        if (queryError?.code === '42P01') {
          // Table doesn't exist, that's fine
        }
        console.error(`Error executing statement:`, error.message)
        console.error(`Statement: ${statement.substring(0, 100)}...`)
      }
    } catch (err) {
      console.error(`Error: ${err}`)
    }
  }

  console.log(`Completed: ${filename}`)
  return true
}

async function main() {
  const migrations = [
    '00012_offer_activities.sql',
    '00013_company_settings.sql',
  ]

  console.log('Starting migrations...')
  console.log(`Supabase URL: ${supabaseUrl}`)

  for (const migration of migrations) {
    await runMigration(migration)
  }

  console.log('\nMigrations complete!')
}

main().catch(console.error)
