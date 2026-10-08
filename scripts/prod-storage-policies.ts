/**
 * PRODUCTION read-only: storage-buckets (public?) og politikker på storage.objects + antal objekter pr. top-mappe
 * (kun antal, ingen navne/indhold).   npx tsx scripts/prod-storage-policies.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-storage-policies', async (run, masked) => {
  const buckets = await run(`SELECT id, public FROM storage.buckets ORDER BY id`)
  const pols = await run(`SELECT policyname, cmd, array_to_string(roles, ',') roles, coalesce(qual, '-') qual, coalesce(with_check, '-') chk
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`)
  const counts = await run(`SELECT bucket_id, split_part(name, '/', 1) top, count(*) n FROM storage.objects GROUP BY 1, 2 ORDER BY 1, 3 DESC`)
  console.log(`--- storage @ prod:${masked} ---`)
  console.log('buckets: ' + JSON.stringify(buckets))
  for (const p of pols as Array<{ policyname: string; cmd: string; roles: string; qual: string; chk: string }>) console.log(`${p.cmd.padEnd(6)} ${p.policyname} [${p.roles}] USING ${p.qual.slice(0, 140)} CHECK ${p.chk.slice(0, 100)}`)
  console.log('objekter pr. mappe: ' + JSON.stringify(counts))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
