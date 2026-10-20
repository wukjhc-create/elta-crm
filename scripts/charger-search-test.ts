/** Ladestander-soegning siger naar kataloget ikke kan hentes. Et aegte tomt traef bliver. Koer: npx tsx scripts/charger-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="charger-search-error"') && view.includes('Det tælles ikke som ingen ladestandere.'), true)
eq('samme soegning bliver', view.includes('chargerQueryRef.current === q') && view.includes('De tidligere forslag bliver.'), true)
eq('gammelt svar ignoreres', view.includes('if (req !== chargerReq.current) return'), true)
eq('aegte traef bliver', view.includes('setChargerHits(r.data ?? [])'), true)
eq('andet soegeord ryddes', view.includes('setChargerHits([])'), true)
eq('ikke prissat bliver', view.includes('Uden valgt lader markeres hardwaren &quot;Ikke prissat&quot; — der gættes aldrig.'), true)
eq('kost bliver', view.includes('formatCurrency(h.cost_price)'), true)

const action = fs.readFileSync('src/lib/actions/auto-project.ts', 'utf8')
eq('kort soegning bliver tom', action.includes('if (q.length < 2) return { success: true, data: [] }'), true)
eq('kostfilter bliver', action.includes(".gt('cost_price', 0)"), true)

console.log(fail ? `\n${fail} fejl` : '\ncharger-search-test OK')
process.exitCode = fail ? 1 : 0
