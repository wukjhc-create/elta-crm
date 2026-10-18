/**
 * En fejlet leverandørhentning er ikke et tomt katalog.
 *   npx tsx scripts/suppliers-load-error-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supplierListView } from '../src/lib/suppliers/supplier-list-view'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

ok(supplierListView(false, null, 0) === 'loading', 'foerste hentning er ikke tom')
ok(supplierListView(false, 'Kunne ikke hente leverandører', 0) === 'failed', 'fejl foer foerste svar er ikke tom')
ok(supplierListView(true, null, 0) === 'empty', 'tom succes bliver tom')
ok(supplierListView(true, 'Kunne ikke hente leverandører', 0) === 'failed', 'senere fejl paa tom liste er ikke et tomt katalog')
ok(supplierListView(true, 'Kunne ikke hente leverandører', 2) === 'ready', 'senere fejl beholder listen')
ok(supplierListView(true, null, 2) === 'ready', 'liste med leverandoerer er klar')

const src = readFileSync(join('src', 'components', 'modules', 'suppliers', 'suppliers-list.tsx'), 'utf8')
ok(src.includes('supplierListView(suppliers !== null, loadError, rows.length)'), 'listen bruger visningen')
ok(src.includes('data-testid="suppliers-load-error"'), 'fejlen har sit eget spor')
ok(src.includes('{loadError}. Det tælles ikke som ingen leverandører.'), 'fejlen siger at den ikke er et tomt katalog')
ok(src.includes("view === 'failed' ? null : filteredSuppliers.length === 0"), 'tom tekst vises ikke ved fejl')
ok(src.includes('Ingen leverandører endnu') && src.includes('Opret din første leverandør'), 'tom succes siger stadig opret')
const setCalls = src.split('setSuppliers(').length - 1
ok(setCalls === 1 && src.includes('setSuppliers(result.data)'), 'fejl skriver ikke listen om til tom', String(setCalls))

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  suppliers-load-error-test')
