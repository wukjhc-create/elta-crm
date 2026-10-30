/** Pilot 2026-10-30: klassifikation af mislykkede handlinger (src/lib/pilot/action-failure-class.ts). npx tsx scripts/action-failure-class-test.ts */
import { classifyActionFailure, type ActionFailureClass } from '../src/lib/pilot/action-failure-class'

const CASES: Array<[string, ActionFailureClass]> = [
  ['Du har ikke adgang til at oprette timer.', 'permission'],
  ['Manglende tilladelse: time_logs.create', 'permission'],
  ['Arbejdsordren er ikke tildelt dig', 'permission'],
  ['Du kan kun registrere tid paa din egen medarbejder-konto', 'permission'],
  ['Ingen adgang til sagen', 'permission'],
  ['Kun kontoret kan genåbne en afsluttet arbejdsordre', 'permission'],
  ['Medarbejderen mangler timepris — kan ikke registrere tid', 'rate'],
  ['Tidsrummet overlapper en anden registrering (07:30–11:45)', 'overlap'],
  ['Arbejdsordre ikke fundet', 'not_found'],
  ['Billedet findes ikke på sagen', 'not_found'],
  ['Arbejdsordren er ændret i mellemtiden — opdatér siden', 'conflict'],
  ['Godkendte timer kan ikke ændres — bed en godkender om at rette dem', 'locked'],
  ['Kan ikke registrere timer på en annulleret arbejdsordre', 'locked'],
  ['Kunden har allerede underskrevet', 'locked'],
  ['Kan ikke afsluttes — der er en aktiv timer på arbejdsordren', 'locked'],
  ['Kunne ikke gemme billedet', 'db'],
  ['Kunne ikke kontrollere aktive timere — prøv igen', 'db'],
  ['Filen er for stor (max 20 MB)', 'validation'],
  ['Kun billeder (JPG, PNG, WEBP, HEIC) og PDF', 'validation'],
  ['Dato skal være i formatet YYYY-MM-DD', 'validation'],
  ['Angiv enten antal timer eller sluttid', 'validation'],
  ['noget helt andet', 'other'],
]
let fail = 0
for (const [msg, want] of CASES) {
  const got = classifyActionFailure(msg)
  if (got !== want) { fail++; console.log(`FAIL  "${msg}" → ${got} (forventet ${want})`) }
}
console.log(fail ? `❌ ${fail}/${CASES.length} fejl` : `✅ action-failure-class ${CASES.length}/${CASES.length}`)
process.exitCode = fail ? 1 : 0
