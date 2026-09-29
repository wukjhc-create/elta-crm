/**
 * PRODUCTION read-only post-check for 00163 (agent capability-guard): struktur + paritet med capability-registeret.
 * (Trigger-adfaerd kan ikke testes i en read-only-transaktion; den er bevist paa staging: harness:agent-gating 13/13.)
 *   npm run prod:verify-00163
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { listCapabilities } from '../src/lib/agents/capability-registry'

withProdReadOnly('prod-verify-00163', async (run, masked) => {
  const problems: string[] = []
  const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }
  console.log(`--- 00163 @ prod:${masked} ---`)
  const caps = (await run(`SELECT key, side_effect_class, requires_approval, min_approvals, agent_types FROM agent_capabilities ORDER BY key`)) as any[]
  const reg = listCapabilities()
  expect(caps.length === reg.length, `agent_capabilities har ${caps.length} rækker (register: ${reg.length})`)
  for (const k of reg) {
    const d = caps.find((c) => c.key === k.key)
    expect(!!d && d.side_effect_class === k.sideEffectClass && d.requires_approval === k.defaultRequiresApproval && d.min_approvals === k.minApprovals
      && [...d.agent_types].sort().join() === [...k.agentTypes].sort().join(), `${k.key} = register`)
  }
  const trg = (await run(`SELECT t.tgname, t.tgenabled, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') cfg
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = 'public.agent_actions'::regclass AND t.tgname = 'trg_agent_actions_capability_guard'`))[0]
  expect(!!trg && trg.tgenabled === 'O' && trg.prosecdef && /search_path=public/.test(trg.cfg), 'trigger aktiv, SECURITY DEFINER, search_path låst')
  const rls = (await run(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agent_capabilities'::regclass`))[0]
  const anon = (await run(`SELECT has_table_privilege('anon', 'public.agent_capabilities', 'SELECT') a, has_table_privilege('authenticated', 'public.agent_capabilities', 'INSERT') ai`))[0]
  expect(rls.relrowsecurity === true && !anon.a && !anon.ai, 'RLS aktiv; anon ingen adgang; authenticated kan ikke skrive')
  const fnx = (await run(`SELECT has_function_privilege('anon', 'public.agent_actions_capability_guard()', 'EXECUTE') a, has_function_privilege('authenticated', 'public.agent_actions_capability_guard()', 'EXECUTE') u`))[0]
  expect(!fnx.a && !fnx.u, 'guard-funktion ikke kaldbar af anon/authenticated')
  console.log(problems.length ? `\n=== 00163 PROD: ❌ ${problems.length} afvigelse(r) ===` : '\n=== 00163 PROD: ✅ struktur + paritet (ingen skrivning udført) ===')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
