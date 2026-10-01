/**
 * Unit: sikre PostgREST-filterværdier (pgQuote/escapeLike/ilikeContains). Semantikken mod rigtig PostgREST er bevist
 * med `npx tsx scripts/test-harness/cli.ts or-filter` (staging); her låses selve transformationen.
 * Kør: npx tsx scripts/postgrest-filter-test.ts
 */
import { escapeLike, pgQuote, ilikeContains, orIlikeContains } from '../src/lib/validations/postgrest-filter'

let fail = 0
const eq = (n: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}
const BS = String.fromCharCode(92) // én backslash

eq('escapeLike %', escapeLike('50%'), `50${BS}%`)
eq('escapeLike _', escapeLike('a_b'), `a${BS}_b`)
eq('escapeLike backslash', escapeLike(`a${BS}b`), `a${BS}${BS}b`)
eq('escapeLike rører ikke komma/parentes', escapeLike('3x1,5 (A)'), '3x1,5 (A)')
eq('pgQuote komma', pgQuote('3x1,5'), '"3x1,5"')
eq('pgQuote citationstegn', pgQuote('"A"'), `"${BS}"A${BS}""`)
eq('pgQuote backslash', pgQuote(`a${BS}b`), `"a${BS}${BS}b"`)
eq('ilikeContains komma', ilikeContains('name', '3x1,5'), 'name.ilike."%3x1,5%"')
eq('ilikeContains % (LIKE-escape, så citat)', ilikeContains('name', '%'), `name.ilike."%${BS}${BS}%%"`)
eq('ilikeContains parentes', ilikeContains('name', 'Hansen, Jens (VVS)'), 'name.ilike."%Hansen, Jens (VVS)%"')
eq('orIlikeContains to kolonner', orIlikeContains(['a', 'b'], 'x,y'), 'a.ilike."%x,y%",b.ilike."%x,y%"')
eq('injektionsforsøg forbliver én værdi', ilikeContains('name', 'x%,id.neq.0'), `name.ilike."%x${BS}${BS}%,id.neq.0%"`)

console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle postgrest-filter-tests PASS')
process.exitCode = fail ? 1 : 0
