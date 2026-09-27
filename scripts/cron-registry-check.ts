/**
 * P1 #9 — statisk: cron-registeret (src/lib/services/cron-registry.ts) matcher vercel.json, og HVER cron-route er
 * pakket i withCronRun (saa ingen koersel er usynlig). Koer: npm run ops:cron-check  (exit 2 ved fund)
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { CRON_REGISTRY } from '../src/lib/services/cron-registry'

export function runCronRegistryCheck(): string[] {
  const root = process.cwd()
  const findings: string[] = []
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { crons?: Array<{ path: string; schedule: string }> }
  const scheduled = new Map((vercel.crons ?? []).map((c) => [c.path.split('/').pop()!, c.schedule]))
  const reg = new Map(CRON_REGISTRY.map((c) => [c.name, c]))
  for (const [name, sched] of scheduled) {
    const r = reg.get(name)
    if (!r) findings.push(`${name}: planlagt i vercel.json men mangler i cron-registeret`)
    else if (r.schedule !== sched) findings.push(`${name}: registeret siger ${r.schedule}, vercel.json ${sched}`)
  }
  for (const name of reg.keys()) if (!scheduled.has(name)) findings.push(`${name}: i registeret men ikke planlagt`)
  const dir = join(root, 'src', 'app', 'api', 'cron')
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, 'route.ts')
    if (!existsSync(f)) continue
    const src = readFileSync(f, 'utf8')
    if (!src.includes(`export const GET = withCronRun('${name}', `)) findings.push(`${name}: route er ikke pakket i withCronRun('${name}', …)`)
    if (/export async function GET/.test(src)) findings.push(`${name}: eksporterer stadig en upakket GET`)
  }
  return findings
}

if (process.argv[1] && /cron-registry-check/.test(process.argv[1])) {
  const f = runCronRegistryCheck()
  console.log(`CRON-REGISTER: ${CRON_REGISTRY.length} crons`)
  for (const x of f) console.log(`  ❌ ${x}`)
  console.log(f.length ? `  ❌ ${f.length} fund` : '  ✅ register = vercel.json, alle routes logger koersler')
  process.exitCode = f.length ? 2 : 0
}
