/**
 * PRODUCTION read-only: pre/post for 00202 (afviste timer ude af create_invoice_from_work_order og
 * calculate_work_order_profit). Kun funktionsdefinitioner (metadata) + ACL.
 *   npx tsx scripts/prod-verify-00202.ts pre|post
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'

withProdReadOnly(`prod-verify-00202-${mode}`, async (run, masked) => {
  const rows = (await run(`SELECT p.proname name, pg_get_functiondef(p.oid) def, has_function_privilege('service_role', p.oid, 'EXECUTE') svc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('create_invoice_from_work_order', 'calculate_work_order_profit')`)) as Array<{ name: string; def: string; svc: boolean }>
  const get = (n: string) => rows.find((r) => r.name === n)
  const inv = get('create_invoice_from_work_order'), prof = get('calculate_work_order_profit')
  const cnt = (d: string | undefined) => (d?.match(/approval_status <> 'rejected'/g) ?? []).length
  const want = mode === 'pre' ? [0, 0] : [1, 2]
  const checks: Array<[string, boolean, string]> = [
    ['create_invoice_from_work_order findes', !!inv, ''],
    ['calculate_work_order_profit findes', !!prof, ''],
    [`faktura-funktion: ${want[0]} afvist-betingelse(r)`, cnt(inv?.def) === want[0], String(cnt(inv?.def))],
    [`avance-funktion: ${want[1]} afvist-betingelse(r)`, cnt(prof?.def) === want[1], String(cnt(prof?.def))],
    ['service_role kan køre begge', !!inv?.svc && !!prof?.svc, `${inv?.svc}/${prof?.svc}`],
  ]
  console.log(`--- 00202 ${mode} @ prod:${masked} ---`)
  for (const [l, ok, n] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${n ? ` (${n})` : ''}`)
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
