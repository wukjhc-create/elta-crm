/**
 * PRODUCTION read-only pre-/post-check for P-009 laese-lockdowns (00175, 00176, 00177, 00179).
 *   npx tsx scripts/prod-verify-read-lockdown.ts <00175|00176|00177|00179|all> pre|post
 * Kolonnelisterne laeses direkte fra migrationsfilerne (REVOKE SELECT ... / GRANT SELECT (kolonner) ...), saa
 * verifikationen altid matcher den SQL der koeres.
 * pre:  hver GRANT-kolonne findes i prod (ellers fejler GRANT og hele migrationen ruller tilbage), og prod har
 *       ingen kolonner udover grant-listen + de bevidst skjulte hemmeligheder (en ny kolonne ville blive usynlig for UI).
 * post: authenticated har ikke laengere tabel-SELECT; offentlige kolonner er laesbare, hemmelige ikke; anon er
 *       uden grants hvor migrationen REVOKE ALL'er; messages_select_own findes og den aabne policy er vaek.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { READ_LOCKDOWN_NRS, runReadLockdownChecks } from './rls/read-lockdown-checks'

const arg = process.argv[2] || 'all'
const mode = process.argv[3] === 'post' ? 'post' : 'pre'
const selected: string[] = arg === 'all' ? [...READ_LOCKDOWN_NRS] : READ_LOCKDOWN_NRS.filter((n) => n === arg)
let problems: string[] = []

async function main() {
  if (!selected.length) throw new Error(`ukendt migration ${arg} (brug ${READ_LOCKDOWN_NRS.join('|')}|all)`)
  await withProdReadOnly(`prod-verify-read-lockdown-${arg}`, async (run, masked) => {
    console.log(`--- P-009 laese-lockdown ${selected.join(',')} ${mode} @ prod:${masked} ---`)
    problems = await runReadLockdownChecks(run, mode, selected)
  })
}
main().then(() => {
  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r) — STOP` : '\n✅ som forventet')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
