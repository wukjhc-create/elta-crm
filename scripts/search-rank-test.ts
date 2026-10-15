/**
 * Unit-tests for leverandørsøgningens rangering (src/lib/products/search-rank.ts). Ingen DB.
 *   npx tsx scripts/search-rank-test.ts
 */
import { rankBy, relevance, searchWords } from '../src/lib/products/search-rank'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(JSON.stringify(searchWords(' Kabel  3G1,5 (PVIK) ')) === JSON.stringify(['kabel', '3g1', '5', 'pvik']), 'ord splittes, specialtegn fjernes', JSON.stringify(searchWords(' Kabel  3G1,5 (PVIK) ')))
ok(searchWords('a b c d e f g').length === 5, 'højst 5 ord')

type P = { sku: string; name: string; ean: string; cost: number }
const f = (p: P) => p
ok(relevance({ sku: '1234567', name: 'X', ean: '', cost: 1 }, '1234567') === 0, 'præcist varenr. = 0')
ok(relevance({ sku: '', name: 'X', ean: '5701234567890', cost: 1 }, '5701234567890') === 0, 'præcis EAN = 0')
ok(relevance({ sku: '', name: 'Kabel PVIK 3G1,5', ean: '', cost: 1 }, 'kabel') === 1, 'navn starter med søgning = 1')
ok(relevance({ sku: '', name: 'PVIK kabel 3G1,5', ean: '', cost: 1 }, 'kabel pvik') === 2, 'alle ord i navnet = 2')
ok(relevance({ sku: '99kabel', name: 'Noget andet', ean: '', cost: 1 }, 'kabel') === 3, 'kun varenr.-delmatch = 3')

const rows: P[] = [
  { sku: 'A1', name: 'Samledåse til kabel', ean: '', cost: 2 },
  { sku: 'A2', name: 'Kabel PVIK 3G1,5', ean: '', cost: 9 },
  { sku: 'KABEL', name: 'Strips', ean: '', cost: 50 },
  { sku: 'A3', name: 'Kabel PVIK 3G1,5 100m', ean: '', cost: 5 },
]
const r = rankBy(rows, 'kabel', f).map((x) => x.sku)
ok(JSON.stringify(r) === JSON.stringify(['KABEL', 'A3', 'A2', 'A1']), 'præcist varenr. først, så navn-start efter pris, så resten', JSON.stringify(r))
ok(rankBy([{ sku: 'x', name: 'y', ean: '', cost: 0 }, { sku: 'z', name: 'y', ean: '', cost: 3 }], 'q', f)[0].sku === 'z', 'kostpris 0 sidst')

console.log(bad ? `\n${bad} FAIL` : '\nALL PASS')
process.exit(bad ? 1 : 0)
