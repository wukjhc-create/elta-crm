/** Pilot-tjeklisten bliver ikke groen, naar en taelling fejler. Groent nul bliver. Koer: npx tsx scripts/pilot-setup-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/pilot-setup.ts', 'utf8')
eq('portal', src.includes('!portalUnread.error && (portalUnread.count ?? 0) === 0') && src.includes('Kunne ikke tælle kundebeskeder. Det tælles ikke som 0.'), true)
eq('mailfaktura', src.includes('!mailInvoicesNoFile.error && (mailInvoicesNoFile.count ?? 0) === 0') && src.includes('Kunne ikke tælle mail-fakturaer. Det tælles ikke som 0.'), true)
eq('leverandoer', src.includes('!invoicesNoSupplier.error && (invoicesNoSupplier.count ?? 0) === 0') && src.includes('Kunne ikke tælle leverandørfakturaer. Det tælles ikke som 0.'), true)
eq('pladsholder', src.includes('!placeholderCustomers.error && (placeholderCustomers.count ?? 0) === 0') && src.includes('Kunne ikke tælle kunder uden e-mail. Det tælles ikke som 0.'), true)
eq('henvendelse', src.includes('!webFailed && openWeb === 0') && src.includes('Kunne ikke tælle henvendelser. Det tælles ikke som 0.'), true)
eq('sager', src.includes('!casesFailed && newWithWork === 0') && src.includes('Kunne ikke tælle sager. Det tælles ikke som 0.'), true)
eq('priser', src.includes('!pricesFailed && staleSuppliers.length === 0') && src.includes('Kunne ikke tjekke leverandørpriser. Det tælles ikke som friske.'), true)
eq('montoer', src.includes('!montorLookupFailed && unlinkedMontors === 0') && src.includes('Kunne ikke tælle montør-logins. Det tælles ikke som 0.'), true)
eq('economic', src.includes('!customerLinkFailed && unlinkedCustomers === 0') && src.includes('Kunne ikke tælle kunder uden e-conomic. Det tælles ikke som 0.'), true)
eq('portal-nul bliver', src.includes('ingen ulæste kundebeskeder'), true)
eq('mail-nul bliver', src.includes('alle mail-fakturaer har bilag'), true)
eq('pris-nul bliver', src.includes('alle aktive leverandørers priser er friske'), true)
eq('60 dage bliver', src.includes('60 * 86_400_000'), true)
eq('kun admin bliver', src.includes("message: 'Kun admin'"), true)

const view = fs.readFileSync('src/app/dashboard/go-live/pilot-setup-card.tsx', 'utf8')
eq('kortet bliver', view.includes('data-testid="pilot-setup"') && view.includes('alt på plads'), true)
eq('roed bliver', view.includes("data-ok={i.ok ? 'ja' : 'nej'}"), true)

console.log(fail ? `\n${fail} fejl` : '\npilot-setup-load-test OK')
process.exitCode = fail ? 1 : 0
