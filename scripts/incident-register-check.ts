/**
 * P1 #10 — statisk: src/lib/ops/incident-register.ts matcher docs/pilot/INCIDENT_LOG.md (id, sev, lukket ☑/aaben ☐).
 * Koer: npm run ops:incident-check  (exit 2 ved afvigelse)
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { INCIDENT_REGISTER } from '../src/lib/ops/incident-register'

export function runIncidentRegisterCheck(): string[] {
  const md = readFileSync(join(process.cwd(), 'docs', 'pilot', 'INCIDENT_LOG.md'), 'utf8')
  const rows = md.split('\n').filter((l) => /^\| P-\d{3} \|/.test(l))
  const doc = new Map(rows.map((l) => {
    const cells = l.split('|').map((c) => c.trim())
    return [cells[1], { sev: cells[4], closed: cells[cells.length - 2].startsWith('☑') }]
  }))
  const findings: string[] = []
  for (const i of INCIDENT_REGISTER) {
    const d = doc.get(i.id)
    if (!d) { findings.push(`${i.id}: findes i registeret men ikke i INCIDENT_LOG.md`); continue }
    if (d.sev !== i.severity) findings.push(`${i.id}: sev ${i.severity} ≠ log ${d.sev}`)
    if (d.closed !== i.closed) findings.push(`${i.id}: lukket=${i.closed} ≠ log ${d.closed ? '☑' : '☐'}`)
  }
  for (const id of doc.keys()) if (!INCIDENT_REGISTER.some((i) => i.id === id)) findings.push(`${id}: i INCIDENT_LOG.md men mangler i registeret`)
  return findings
}

if (process.argv[1] && /incident-register-check/.test(process.argv[1])) {
  const f = runIncidentRegisterCheck()
  console.log(`INCIDENT-REGISTER: ${INCIDENT_REGISTER.length} incidents`)
  for (const x of f) console.log(`  ❌ ${x}`)
  console.log(f.length ? `  ❌ ${f.length} afvigelse(r)` : '  ✅ register = INCIDENT_LOG.md')
  process.exitCode = f.length ? 2 : 0
}
