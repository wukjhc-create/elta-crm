/**
 * Unit-tests for avatar-sti-værnet (src/lib/auth/avatar-path.ts). Ingen DB.
 *   npx tsx scripts/avatar-path-test.ts
 */
import { isOwnAvatarPath } from '../src/lib/auth/avatar-path'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const id = '11111111-2222-3333-4444-555555555555'

ok(isOwnAvatarPath(`avatars/${id}-1759600000000.png`, id), 'egen avatar accepteres')
ok(!isOwnAvatarPath(`avatars/99999999-2222-3333-4444-555555555555-1.png`, id), 'andens avatar afvises')
ok(!isOwnAvatarPath('customer-documents/abc/fuldmagt-2026-10-05.pdf', id), 'kundedokument afvises')
ok(!isOwnAvatarPath(`avatars/${id}-1/../../customer-documents/x.pdf`, id), 'sti-traversal afvises')
ok(!isOwnAvatarPath(`avatars/${id}-x/sub.png`, id), 'undermapper afvises')
ok(!isOwnAvatarPath(null, id) && !isOwnAvatarPath('', id), 'tom sti')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle avatar-sti-tests bestået')
process.exitCode = bad ? 1 : 0
