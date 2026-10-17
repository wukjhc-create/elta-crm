/**
 * TK-1/TK-2 (review 2026-10-17): datetime-local ↔ UTC i dansk tid (sommer- og vintertid). Ren logik.
 *   npx tsx scripts/datetime-local-test.ts
 */
import { isoToCopenhagenInput, copenhagenInputToIso } from '../src/lib/utils/datetime-local'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}

// sommertid (UTC+2)
eq('sommer: 07:00Z vises som 09:00 dansk', isoToCopenhagenInput('2026-10-20T07:00:00+00:00'), '2026-10-20T09:00')
eq('sommer: 09:00 dansk gemmes som 07:00Z', copenhagenInputToIso('2026-10-20T09:00'), '2026-10-20T07:00:00.000Z')
// vintertid (UTC+1)
eq('vinter: 08:00Z vises som 09:00 dansk', isoToCopenhagenInput('2026-12-01T08:00:00Z'), '2026-12-01T09:00')
eq('vinter: 09:00 dansk gemmes som 08:00Z', copenhagenInputToIso('2026-12-01T09:00'), '2026-12-01T08:00:00.000Z')
// rundtur uden ændring flytter ikke tiden (før −1/−2 t ved hver gem)
const iso = '2026-10-20T12:30:00.000Z'
eq('rundtur er stabil', copenhagenInputToIso(isoToCopenhagenInput(iso)), iso)
// over midnat i UTC
eq('22:30Z (sommer) = næste dag 00:30 dansk', isoToCopenhagenInput('2026-10-20T22:30:00Z'), '2026-10-21T00:30')
eq('tom ISO → tom streng', isoToCopenhagenInput(null), '')
eq('tom input → null', copenhagenInputToIso(''), null)

console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
