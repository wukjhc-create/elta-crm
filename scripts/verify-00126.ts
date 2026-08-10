/**
 * Verificer 00126: portal_access_tokens er lukket for anon.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const token = process.env.SUPABASE_ACCESS_TOKEN!
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

async function query(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error('Query failed:', res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  console.log('\n=== VERIFY 00126 — portal_access_tokens anon lockdown ===\n')

  const targetPolicies = ['Anyone can validate tokens', 'Anon can update portal token access time']
  const policyRows = await query(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'portal_access_tokens' AND policyname = ANY(ARRAY['${targetPolicies.join("','")}']);
  `)
  if (policyRows && policyRows.length === 0) {
    console.log('1. Anon SELECT + UPDATE policies: DROPPET ✅')
  } else {
    console.log('1. Policies stadig aktive ❌', policyRows)
  }

  const grants = await query(`
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'portal_access_tokens' AND grantee = 'anon';
  `)
  if (grants && Array.isArray(grants)) {
    if (grants.length === 0) {
      console.log('2. Anon-grants paa portal_access_tokens: INGEN ✅')
    } else {
      console.log('2. Anon-grants stadig aktive ❌', grants)
    }
  }

  // Liste alle resterende policies paa tabellen
  const allPolicies = await query(`
    SELECT policyname, roles, cmd FROM pg_policies
    WHERE tablename = 'portal_access_tokens'
    ORDER BY policyname;
  `)
  console.log('\n3. Resterende policies paa portal_access_tokens:')
  if (allPolicies && Array.isArray(allPolicies)) {
    for (const p of allPolicies) {
      console.log(`   - ${p.policyname} (roles=${JSON.stringify(p.roles)}, cmd=${p.cmd})`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
