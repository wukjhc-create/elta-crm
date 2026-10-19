/**
 * Unit-test for IV2-3 (2026-10-19): produktbilleder til tilbuds-PDF hentes kun fra https + offentlige værter og
 * indlejres; alt andet bliver til "intet billede". Ingen netværk: kun afvisninger + data-URI'er testes.
 *   npx tsx scripts/pdf-image-guard-test.ts
 */
import { fetchPdfImageAsDataUri, inlinePdfLineImages } from '../src/lib/pdf/inline-pdf-images'

let bad = 0
const ok = (cond: boolean, label: string) => { if (!cond) bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`) }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function main() {
  for (const u of ['http://example.com/a.png', 'https://localhost/a.png', 'https://127.0.0.1/a.png', 'https://10.0.0.5/a.png',
    'https://169.254.169.254/latest/meta-data', 'https://[::1]/a.png', 'file:///etc/passwd', 'C:\\Windows\\win.ini', '/etc/passwd',
    'https://user:pw@example.com/a.png', 'https://intranet.local/a.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'ftp://example.com/a.png']) {
    ok((await fetchPdfImageAsDataUri(u)) === null, `afvist: ${u}`)
  }
  ok((await fetchPdfImageAsDataUri(PNG)) === PNG, 'gyldig PNG-data-URI beholdes')
  ok((await fetchPdfImageAsDataUri('')) === null, 'tom streng → null')

  const lines = [{ id: 1, image_url: 'http://127.0.0.1:3000/x.png' }, { id: 2, image_url: PNG }, { id: 3, image_url: null }, { id: 4 }]
  const out = await inlinePdfLineImages(lines)
  ok(out.length === 4, 'alle linjer bevares')
  ok(out[0].image_url === null, 'intern URL fjernes fra linjen')
  ok(out[1].image_url === PNG, 'data-URI bevares på linjen')
  ok(out[2].image_url === null && !('image_url' in out[3]), 'linjer uden billede uændrede')
  ok(lines[0].image_url === 'http://127.0.0.1:3000/x.png', 'input muteres ikke')
  ok((await inlinePdfLineImages(null)).length === 0, 'null-liste → []')

  console.log(`\n${bad === 0 ? '✅ ALLE PDF-BILLED-TESTS PASS' : `❌ ${bad} FEJL`}`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
