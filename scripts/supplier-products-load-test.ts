/** Leverandoerprodukter beholdes for samme soegning naar hentningen fejler. 0 og priser bliver. Koer: npx tsx scripts/supplier-products-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
eq('samme soegning beholdes', src.includes('loadedKey.current !== key'), true)
eq('tilladelse rydder priser', src.includes("message.includes('Manglende tilladelse')"), true)
eq('udlogget rydder priser', src.includes("message.includes('Ikke logget ind')"), true)
eq('gammel soegning vises ikke', src.includes('if (my !== seq.current) return'), true)
eq('0 taelles ikke', src.includes('Det tælles ikke som 0 produkter.'), true)
eq('tom liste taelles ikke', src.includes('Det tælles ikke som ingen produkter.'), true)
eq('aegte tom liste bliver', src.includes('Ingen produkter fundet'), true)
eq('fejl er en alert', src.includes('role="alert"') && src.includes('{loadError}'), true)
eq('kostpris bruger lagret tekst', src.includes('storedCostText(product.cost_price)'), true)
eq('kostpris opfinder ikke 0', src.includes('formatCurrency(product.cost_price)'), false)
eq('listepris siger at den mangler', src.includes('storedCostText(product.list_price)'), true)
eq('salgspris bliver', src.includes('formatCurrency(product.effective_sale_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-products-load-test OK')
process.exitCode = fail ? 1 : 0
