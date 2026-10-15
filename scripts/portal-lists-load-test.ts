/** Kundeportalen siger naar listerne ikke kan hentes. Aegte tomme tekster bliver. Koer: npx tsx scripts/portal-lists-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/portal/[token]/page.tsx', 'utf8')
eq('tilbud tjekker success', page.includes('offersResult.success ? offersResult.data || [] : []'), true)
eq('tilbud sender fejl', page.includes("offersResult.success ? null : offersResult.error || 'Kunne ikke hente tilbud'"), true)
eq('beskeder tjekker success', page.includes('messagesResult.success ? messagesResult.data || [] : []'), true)
eq('sager tjekker success', page.includes('serviceCasesResult.success ? serviceCasesResult.data || [] : []'), true)
eq('fakturaer tjekker success', page.includes('invoicesResult.success ? invoicesResult.data || [] : []'), true)
eq('dokumenter tjekker success', page.includes('documentsResult.success ? documentsResult.data || [] : []'), true)
eq('fuldmagter beholder egne dokumenter', page.includes('fuldmagter={fuldmagterResult.data || []}'), true)
eq('fuldmagtfejl sendes', page.includes("fuldmagterResult.success ? null : fuldmagterResult.error || 'Kunne ikke hente dokumenter'"), true)
eq('blind tilbudsliste er vaek', page.includes('offers={offersResult.data || []}'), false)

const dash = fs.readFileSync('src/components/modules/portal/portal-dashboard.tsx', 'utf8')
eq('tilbudsbanner', dash.includes('data-testid="portal-offers-load-error"') && dash.includes('Det tælles ikke som ingen tilbud.'), true)
eq('sagsbanner', dash.includes('data-testid="portal-cases-load-error"') && dash.includes('Det tælles ikke som ingen sager.'), true)
eq('fakturabanner', dash.includes('data-testid="portal-invoices-load-error"') && dash.includes('Det tælles ikke som ingen fakturaer.'), true)
eq('dokumentbanner', dash.includes('data-testid="portal-documents-load-error"') && dash.includes('Det tælles ikke som ingen dokumenter.'), true)
eq('beskedbanner', dash.includes('data-testid="portal-messages-load-error"') && dash.includes('Det tælles ikke som ingen beskeder.'), true)
eq('tal bliver tankestreg', dash.includes("offersError ? '—' : pendingOffers.length") && dash.includes("messagesError ? '—' : messages.length"), true)
eq('tomt tilbud bliver', dash.includes('!offersError && offers.length === 0') && dash.includes('Du har ingen tilbud endnu. De vises her, når ELTA sender et tilbud.'), true)
eq('tom sag bliver', dash.includes('!serviceCasesError && serviceCases.length === 0') && dash.includes('Der er endnu ingen aktive sager. De vises her, når en sag er i gang.'), true)
eq('beloeb bliver', dash.includes('formatCurrency(offer.final_amount, currency)'), true)

const fuldmagt = fs.readFileSync('src/components/modules/portal/portal-fuldmagt.tsx', 'utf8')
eq('fuldmagtbanner', fuldmagt.includes('data-testid="portal-fuldmagt-load-error"') && fuldmagt.includes('Det tælles ikke som ingen fuldmagter.'), true)
eq('aegte tom fuldmagt skjules', fuldmagt.includes('if (fuldmagter.length === 0) return null'), true)
eq('fuldmagtstekst bliver', fuldmagt.includes('Undertegnede giver hermed'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-lists-load-test OK')
process.exitCode = fail ? 1 : 0
