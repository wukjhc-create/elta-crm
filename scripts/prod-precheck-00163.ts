/**
 * PRODUCTION read-only pre-check for 00163 (agent capability-guard): ville eksisterende agent_actions opfylde guarden?
 *   npx tsx scripts/prod-precheck-00163.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const SPEC: Record<string, { cls: string; approval: boolean; agents: string[] }> = {
  'mail.draft_reply': { cls: 'read', approval: false, agents: ['mail'] },
  'mail.link_customer': { cls: 'update', approval: true, agents: ['mail'] },
  'case.propose_from_email': { cls: 'create', approval: true, agents: ['mail'] },
  'mail.send_reply': { cls: 'send_external', approval: true, agents: ['mail'] },
  'offer.propose_draft_from_case': { cls: 'create', approval: true, agents: ['offer'] },
  'followup.draft_offer_reminder': { cls: 'read', approval: false, agents: ['followup'] },
  'followup.create_task': { cls: 'create', approval: true, agents: ['followup'] },
  'planning.propose_work_order': { cls: 'create', approval: true, agents: ['planning'] },
}

withProdReadOnly('prod-precheck-00163', async (run, masked) => {
  console.log(`--- 00163 pre-check @ prod:${masked} ---`)
  const exists = (await run(`SELECT to_regclass('public.agent_capabilities') IS NOT NULL AS t`))[0].t
  console.log(`  agent_capabilities findes allerede: ${exists ? 'ja' : 'nej'}`)
  const rows = await run(`SELECT a.capability, a.side_effect_class, a.requires_approval, a.min_approvals, r.agent_type, a.status, count(*)::int n
    FROM agent_actions a JOIN agent_runs r ON r.id = a.run_id GROUP BY 1,2,3,4,5,6 ORDER BY 1`)
  let bad = 0
  for (const r of rows as any[]) {
    const s = SPEC[r.capability]
    const problems = !s ? ['ukendt capability'] : [
      s.cls !== r.side_effect_class && `klasse ${r.side_effect_class}≠${s.cls}`,
      s.approval && !r.requires_approval && 'requires_approval=false',
      r.min_approvals < 1 && 'min_approvals<1',
      !s.agents.includes(r.agent_type) && `agent ${r.agent_type}`,
    ].filter(Boolean)
    if (problems.length) bad += r.n
    console.log(`  ${problems.length ? '❌' : '✓'} ${r.capability} [${r.agent_type}|${r.side_effect_class}|approval=${r.requires_approval}|${r.status}] ×${r.n}${problems.length ? ' — ' + problems.join(', ') : ''}`)
  }
  console.log(bad ? `\n=== ❌ ${bad} eksisterende raekke(r) ville blive afvist ved naeste UPDATE ===` : `\n=== ✅ alle ${rows.length} grupper opfylder guarden (ingen skrivning udfoert) ===`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
