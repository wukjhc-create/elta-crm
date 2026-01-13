/**
 * Supabase Setup Verification Script
 * Run with: npx tsx scripts/verify-supabase.ts
 */

import { createClient } from '@supabase/supabase-js'

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const REQUIRED_TABLES = [
  'profiles',
  'leads',
  'lead_activities',
  'messages',
  'customers',
  'customer_contacts',
  'offers',
  'offer_line_items',
  'projects',
  'project_tasks',
  'time_entries',
]

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
}

const results: TestResult[] = []

function log(result: TestResult) {
  results.push(result)
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
  console.log(`${icon} ${result.name}: ${result.message}`)
}

async function main() {
  console.log('\n🔍 Verificerer Supabase opsætning...\n')

  // Test 1: Check environment variables
  console.log('📋 Tjekker environment variables...')
  let envVarsValid = true

  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName]
    if (!value || value.includes('your-')) {
      log({
        name: `ENV: ${varName}`,
        status: 'fail',
        message: 'Mangler eller ikke sat korrekt',
      })
      envVarsValid = false
    } else {
      log({
        name: `ENV: ${varName}`,
        status: 'pass',
        message: 'Sat korrekt',
      })
    }
  }

  if (!envVarsValid) {
    console.log('\n❌ Environment variables er ikke korrekt sat.')
    console.log('Se SUPABASE_SETUP.md for instruktioner.\n')
    return
  }

  // Test 2: Create Supabase client
  console.log('\n📡 Tester Supabase forbindelse...')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Test 3: Check database connection
  try {
    const { data, error } = await supabase.from('profiles').select('count').single()

    if (error) {
      log({
        name: 'Database forbindelse',
        status: 'fail',
        message: `Fejl: ${error.message}`,
      })
      return
    }

    log({
      name: 'Database forbindelse',
      status: 'pass',
      message: 'Forbindelse etableret',
    })
  } catch (error) {
    log({
      name: 'Database forbindelse',
      status: 'fail',
      message: `Ukendt fejl: ${error}`,
    })
    return
  }

  // Test 4: Check all required tables exist
  console.log('\n🗄️  Tjekker database tables...')
  for (const tableName of REQUIRED_TABLES) {
    try {
      const { data, error } = await supabase.from(tableName).select('*').limit(1)

      if (error) {
        if (error.message.includes('does not exist')) {
          log({
            name: `Table: ${tableName}`,
            status: 'fail',
            message: 'Table findes ikke - kør migration',
          })
        } else {
          log({
            name: `Table: ${tableName}`,
            status: 'warning',
            message: `Advarsel: ${error.message}`,
          })
        }
      } else {
        log({
          name: `Table: ${tableName}`,
          status: 'pass',
          message: 'Table findes',
        })
      }
    } catch (error) {
      log({
        name: `Table: ${tableName}`,
        status: 'fail',
        message: `Fejl ved tjek: ${error}`,
      })
    }
  }

  // Test 5: Check RLS policies
  console.log('\n🔒 Tjekker RLS policies...')
  const { data: rlsData } = await supabase.rpc('has_table_privilege', {
    table_name: 'profiles',
    privilege: 'SELECT',
  })

  if (rlsData) {
    log({
      name: 'RLS Policies',
      status: 'pass',
      message: 'RLS er aktiveret',
    })
  } else {
    log({
      name: 'RLS Policies',
      status: 'warning',
      message: 'Kunne ikke verificere RLS - tjek manuelt',
    })
  }

  // Test 6: Check for admin users
  console.log('\n👤 Tjekker admin brugere...')
  const { data: adminUsers, error: adminError } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('role', 'admin')

  if (adminError) {
    log({
      name: 'Admin brugere',
      status: 'fail',
      message: `Fejl: ${adminError.message}`,
    })
  } else if (!adminUsers || adminUsers.length === 0) {
    log({
      name: 'Admin brugere',
      status: 'warning',
      message: 'Ingen admin brugere fundet - opret en!',
    })
  } else {
    log({
      name: 'Admin brugere',
      status: 'pass',
      message: `${adminUsers.length} admin bruger(e) fundet`,
    })
  }

  // Summary
  console.log('\n📊 Opsummering:')
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const warnings = results.filter((r) => r.status === 'warning').length

  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⚠️  Warnings: ${warnings}`)

  if (failed === 0) {
    console.log('\n🎉 Supabase er korrekt sat op og klar til brug!')
  } else {
    console.log('\n⚠️  Der er fejl der skal rettes. Se SUPABASE_SETUP.md for hjælp.')
  }

  console.log('')
}

main().catch((error) => {
  console.error('\n❌ Fatal fejl:', error)
  process.exit(1)
})
