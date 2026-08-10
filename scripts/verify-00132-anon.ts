/**
 * Defense-in-depth verifikation: bekraefter at anon-client ikke kan
 * SELECT/INSERT mod storage.objects efter 00132, selv om anon stadig
 * formelt har GRANTs (storage.objects ejes af supabase_storage_admin,
 * saa REVOKE via Management API faler stille). RLS uden anon-policies
 * blokerer i praksis.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]; let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  console.log('\n=== VERIFY 00132 — anon storage operationer skal nu fejle ===\n')

  // 1. List objekter via anon (skulle blive blokeret)
  const { data: listData, error: listErr } = await anon.storage
    .from('portal-attachments')
    .list('')
  if (listErr) {
    console.log(`1. Anon list portal-attachments: ✅ blokeret (${listErr.message})`)
  } else {
    console.log(`1. Anon list portal-attachments: ❌ tillod ${listData?.length ?? 0} objekter`)
  }

  // 2. Forsoeg upload (skulle blive blokeret)
  const testPath = `test-${Date.now()}.txt`
  const { error: uplErr } = await anon.storage
    .from('portal-attachments')
    .upload(testPath, Buffer.from('anon attack attempt'), { contentType: 'text/plain' })
  if (uplErr) {
    console.log(`2. Anon upload portal-attachments: ✅ blokeret (${uplErr.message})`)
  } else {
    console.log(`2. Anon upload portal-attachments: ❌ tillod`)
    // Cleanup hvis det skulle lykkes
    await anon.storage.from('portal-attachments').remove([testPath])
  }

  // 3. Forsoeg INSERT til 'attachments' bucket via anon (var muligt med qual=true policy)
  const { error: anyBucketErr } = await anon.storage
    .from('attachments')
    .upload(`test-${Date.now()}.txt`, Buffer.from('anon to attachments'), { contentType: 'text/plain' })
  if (anyBucketErr) {
    console.log(`3. Anon upload attachments: ✅ blokeret (${anyBucketErr.message})`)
  } else {
    console.log(`3. Anon upload attachments: ❌ tillod (kritisk!)`)
  }

  // 4. SignedUrl-fetch via anon — fungerer fortsat med URL hvis admin har genereret den
  console.log('\n(Signed URL fetch via anon virker fordi URL er pre-signeret; ikke en sikkerheds-issue.)')
}

main().catch((e) => { console.error(e); process.exit(1) })
