/**
 * One-time migration: Convert old roles to new RBAC roles.
 *
 * POST /api/admin/migrate-roles
 * Auth: CRON_SECRET
 *
 * Maps: user → serviceleder, technician → montør
 * Sets Henrik Christensen as admin.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results: string[] = []

  // 1. Map 'user' → 'serviceleder'
  const { data: users, error: userErr } = await supabase
    .from('profiles')
    .update({ role: 'serviceleder' })
    .eq('role', 'user')
    .select('id, email')

  if (userErr) {
    results.push(`user→serviceleder fejl: ${userErr.message}`)
  } else {
    results.push(`user→serviceleder: ${users?.length || 0} brugere migreret`)
  }

  // 2. Map 'technician' → 'montør'
  const { data: techs, error: techErr } = await supabase
    .from('profiles')
    .update({ role: 'montør' })
    .eq('role', 'technician')
    .select('id, email')

  if (techErr) {
    results.push(`technician→montør fejl: ${techErr.message}`)
  } else {
    results.push(`technician→montør: ${techs?.length || 0} brugere migreret`)
  }

  // 3. Set Henrik Christensen as admin (by name or email pattern)
  const { data: henrik, error: henrikErr } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .or('full_name.ilike.%henrik%christensen%,email.ilike.%henrik%')
    .select('id, email, full_name')

  if (henrikErr) {
    results.push(`Henrik admin fejl: ${henrikErr.message}`)
  } else if (henrik && henrik.length > 0) {
    results.push(`Henrik admin: ${henrik.map(h => `${h.full_name} (${h.email})`).join(', ')}`)
  } else {
    results.push('Henrik ikke fundet — sæt admin manuelt')
  }

  // 4. Show final state
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .order('role')

  return NextResponse.json({
    success: true,
    migration_results: results,
    profiles: allProfiles,
  })
}
