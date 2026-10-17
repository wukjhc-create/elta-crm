/**
 * Unit-tests for billednedskalering før upload (src/lib/utils/image-downscale.ts — de rene dele). Ingen DOM.
 *   npx tsx scripts/image-downscale-test.ts
 */
import { scaledSize, shouldDownscale, UPLOAD_DOWNSCALE_FROM_BYTES } from '../src/lib/utils/image-downscale'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(shouldDownscale({ type: 'image/jpeg', size: 6_000_000 }), 'stort telefonfoto skaleres')
ok(!shouldDownscale({ type: 'image/jpeg', size: UPLOAD_DOWNSCALE_FROM_BYTES - 1 }), 'lille billede uændret')
ok(!shouldDownscale({ type: 'application/pdf', size: 9_000_000 }), 'PDF uændret')
ok(shouldDownscale({ type: 'IMAGE/PNG', size: 3_000_000 }), 'PNG (store bogstaver) skaleres')
// MB-8: HEIC konverteres altid (også små)
ok(shouldDownscale({ type: 'image/heic', size: 400_000 }), 'lille HEIC konverteres til JPEG')
ok(shouldDownscale({ type: 'image/HEIF', size: 400_000 }), 'lille HEIF (store bogstaver) konverteres')
ok(!shouldDownscale({ type: 'image/webp', size: 400_000 }), 'lille WEBP uændret')
const a = scaledSize(4032, 3024)
ok(a.width === 2000 && a.height === 1500, '4032×3024 → 2000×1500', JSON.stringify(a))
const b = scaledSize(3024, 4032)
ok(b.width === 1500 && b.height === 2000, 'portræt bevarer forhold', JSON.stringify(b))
const c = scaledSize(800, 600)
ok(c.width === 800 && c.height === 600, 'mindre end max → uændret')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
