/** Pakker og tilvalg siger naar hentningen fejler. Tom liste, pris og bekraeftelse bliver. Koer: npx tsx scripts/package-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const service = fs.readFileSync('src/lib/services/sales-engine.ts', 'utf8')
const action = fs.readFileSync('src/lib/actions/sales-engine.ts', 'utf8')
const admin = fs.readFileSync('src/app/dashboard/settings/packages/packages-admin-client.tsx', 'utf8')
const picker = fs.readFileSync('src/components/modules/sales/package-picker.tsx', 'utf8')

eq('aktiv liste kaster', service.includes("if (error) throw new Error('Kunne ikke hente pakker')"), true)
eq('pakke og tilvalg kaster', service.includes("if (pkgRes.error || optsRes.error) throw new Error('Kunne ikke hente pakke')"), true)
eq('manglende pakke bliver null', service.includes('if (!pkgRes.data) return null'), true)
eq('tilvalg kaster', action.includes("if (error) throw new Error('Kunne ikke hente tilvalg')"), true)
eq('anvend bliver', action.includes('applyPackageWithOptionsToOffer('), true)

eq('admin siger fejl', admin.includes('data-testid="package-options-load-error"') && admin.includes('Det tælles ikke som ingen tilvalg.'), true)
eq('admin viser ikke tom ved fejl', admin.includes('!optionsError && options.length === 0 && <p className="text-xs text-gray-400">Ingen tilvalg endnu.</p>'), true)
eq('admin rydder ikke tilvalg', admin.includes('setOptions([])'), false)
eq('grundpris bliver', admin.includes('base_price: Number(basePrice) || 0'), true)
eq('bekraeftelse bliver', admin.includes('Tilknyttede tilvalg slettes også.'), true)

eq('vaelger siger listefejl', picker.includes('data-testid="package-list-load-error"') && picker.includes('Det tælles ikke som ingen pakker.'), true)
eq('vaelger siger detaljefejl', picker.includes('data-testid="package-detail-load-error"') && picker.includes('Det tælles ikke som en pakke uden tilvalg.'), true)
eq('tom pakkeliste bliver', picker.includes('Ingen aktive pakker — opret en under Indstillinger → Pakker.'), true)
eq('basispris bliver', picker.includes('fmtAmount(Number(p.base_price))'), true)
eq('tilvalgspris bliver', picker.includes('fmtAmount(Number(o.price))'), true)
eq('anvend-knappen bliver', picker.includes('Anvend pakke'), true)

console.log(fail ? `\n${fail} fejl` : '\npackage-load-test OK')
process.exitCode = fail ? 1 : 0
