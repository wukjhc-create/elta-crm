/**
 * Parts-/publikumsfundament (00254) — rene + statiske tests (ingen DB).
 *   npx tsx scripts/party-audience-test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decideCommunicationClass, deterministicFamily, mayOverwriteClass, isAutomatedSender, COMMUNICATION_CLASSES } from '../src/lib/parties/communication-class'
import { AUDIENCE_KINDS, EXTERNAL_FEED_FIELDS, readExternalFeed, publicationSourceRule } from '../src/lib/parties/audience'
import { PERMISSIONS } from '../src/lib/auth/permissions'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

async function main() {
  // --- Kommunikationsklasse: deterministisk vinder
  ok('leverandør-afsender + AI "customer_request" → supplier_correspondence (deterministisk)', (() => { const d = decideCommunicationClass({ supplierSender: true }, 'customer_request'); return d.communicationClass === 'supplier_correspondence' && d.source === 'deterministic' })())
  ok('leverandør-afsender + AI "purchase_material" → forfinet inden for familien', decideCommunicationClass({ supplierSender: true }, 'purchase_material').communicationClass === 'purchase_material')
  ok('incoming_invoices-kilde → supplier_invoice uanset AI', decideCommunicationClass({ sourceTable: 'incoming_invoices' }, 'customer_request').communicationClass === 'supplier_invoice')
  ok('ELTA-afsender → internal (vinder over leverandør)', decideCommunicationClass({ internalSender: true, supplierSender: true }, 'supplier_correspondence').communicationClass === 'internal')
  ok('AI alene kan ikke påstå internal', decideCommunicationClass({}, 'internal').communicationClass === 'unknown')
  ok('AI alene → ai-kilde', (() => { const d = decideCommunicationClass({}, 'lead'); return d.communicationClass === 'lead' && d.source === 'ai' })())
  ok('ukendt afsender uden AI → unknown/none', (() => { const d = decideCommunicationClass({}); return d.communicationClass === 'unknown' && d.source === 'none' })())
  ok('ugyldigt AI-forslag ignoreres', decideCommunicationClass({}, 'portal_visible').communicationClass === 'unknown')
  ok('partner-relation → partner_order (AI "customer_request" ignoreres)', decideCommunicationClass({ partyRelationships: ['cooperation_partner'] }, 'customer_request').communicationClass === 'partner_order')
  ok('producent-relation → technical_support', deterministicFamily({ partyRelationships: ['manufacturer'] })[0] === 'technical_support')
  ok('underleverandør-relation → subcontractor', deterministicFamily({ partyRelationships: ['subcontractor'] })[0] === 'subcontractor')
  ok('webformular → customer_request|lead', JSON.stringify(deterministicFamily({ webForm: true })) === '["customer_request","lead"]')
  ok('webformular + AI lead → lead', decideCommunicationClass({ webForm: true }, 'lead').communicationClass === 'lead')
  ok('manuelt koblet kunde → customer_request', decideCommunicationClass({ confirmedCustomer: true }, 'newsletter').communicationClass === 'customer_request')
  ok('noreply → automated_system|newsletter', isAutomatedSender('noreply@x.dk') && isAutomatedSender('no-reply+abc@x.dk') && isAutomatedSender('MAILER-DAEMON@x.dk') && !isAutomatedSender('anders@x.dk'))
  ok('leverandør vinder over automatisk afsender', deterministicFamily({ supplierSender: true, automatedSender: true })[0] === 'supplier_correspondence')
  ok('alle 12 klasser findes', COMMUNICATION_CLASSES.length === 12)
  // præcedens = DB-værnet
  ok('serveren kan aldrig sætte manual', !mayOverwriteClass('none', 'manual'))
  ok('ai kan ikke overskrive deterministic', !mayOverwriteClass('deterministic', 'ai'))
  ok('deterministic kan ikke overskrive manual', !mayOverwriteClass('manual', 'deterministic'))
  ok('deterministic overskriver ai', mayOverwriteClass('ai', 'deterministic'))
  ok('internt notat offentliggøres aldrig direkte', publicationSourceRule('internal_note') === 'never' && publicationSourceRule('supplier_correspondence') === 'new_message_only')

  // --- Feed-læseren: fail-closed og eksplicit projektion
  let called = 0
  const fake = { rpc: async (_n: string, _a: unknown) => { called++; return { data: [{ id: '1', body: 'b', published_at: 'x', derived_from_table: 'incoming_emails', derived_from_id: 'y', published_by: 'z', content_kind: 'message' }], error: null } } }
  ok('ingen part → tom liste uden DB-kald', (await readExternalFeed(fake, 'customer', null)).length === 0 && called === 0)
  ok('ukendt publikumstype → tom liste', (await readExternalFeed(fake, 'admin' as never, 'p')).length === 0 && called === 0)
  const rows = await readExternalFeed(fake, 'partner', 'p')
  ok('feed-række fjerner proveniens/udgiver', rows.length === 1 && !('derived_from_table' in rows[0]) && !('published_by' in rows[0]) && !('derived_from_id' in rows[0]))
  ok('feed-felter = DB-funktionens projektion', EXTERNAL_FEED_FIELDS.length === 11 && !EXTERNAL_FEED_FIELDS.some((f) => /derived|published_by|revoked|source/.test(f)))
  ok('publikumstyper', JSON.stringify(AUDIENCE_KINDS) === '["customer","partner","supplier","subcontractor","manufacturer"]')

  // --- Migration: grants og værn
  const m = read('supabase/migrations/00254_party_audience_foundation.sql')
  ok('publish_external KUN til authenticated (aldrig service_role)', /GRANT EXECUTE ON FUNCTION public\.publish_external\([^)]*\), public\.revoke_external_publication\(uuid\) TO authenticated;/.test(m)
    && !/publish_external\([^)]*\)[^;]*TO[^;]*service_role/.test(m))
  ok('external_feed KUN til service_role', /GRANT EXECUTE ON FUNCTION public\.external_feed\(text, uuid\) TO service_role;/.test(m) && !/external_feed\(text, uuid\)[^;]*TO[^;]*authenticated/.test(m))
  ok('service_role mister skriveadgang til external_publications', m.includes('REVOKE ALL ON public.external_publications FROM service_role;') && m.includes('GRANT SELECT ON public.external_publications TO service_role;'))
  ok('ingen anon-grant/-politik', !/TO anon\b/.test(m.replace(/FROM PUBLIC, anon, authenticated/g, '')))
  ok('værnet kræver indlogget bruger = published_by', m.includes("NEW.published_by IS DISTINCT FROM auth.uid()") && m.includes("current_setting('elta.publish', true)"))
  ok('AI-relation kun proposed (CHECK + værn)', m.includes("CONSTRAINT party_rel_active_confirmed") && m.includes("et AI-forslag oprettes kun som proposed"))
  ok('mail-vedhæftninger kan aldrig offentliggøres', m.includes('v_doc.source_email_id IS NOT NULL'))
  ok('NULL-sikre afvisninger (coalesce) i publish_external', (m.match(/NOT coalesce\(/g) ?? []).length >= 4)
  ok('klassifikation bestemmer ikke synlighed (ingen reference fra feed til communication_class)', !/external_feed[\s\S]*?communication_class[\s\S]*?\$f\$;/.test(m.slice(m.indexOf('CREATE FUNCTION public.external_feed'), m.indexOf('-- 7. Rettigheder'))))
  ok('ROLLBACK-sektion findes', m.includes('-- ROLLBACK (manuel'))
  ok('ingen backfill (ingen INSERT INTO parties/relationer i migrationen)', !/INSERT INTO public\.(parties|party_relationships|case_participants)\b/.test(m))

  // --- Rettigheder: kode = migration
  const codeRoles = (k: string) => [...((PERMISSIONS as unknown as Record<string, string[]>)[k] ?? [])].sort()
  ok('parties.manage = admin/serviceleder', JSON.stringify(codeRoles('parties.manage')) === '["admin","serviceleder"]', JSON.stringify(codeRoles('parties.manage')))
  ok('portal.publish = admin/serviceleder/salg', JSON.stringify(codeRoles('portal.publish')) === '["admin","salg","serviceleder"]', JSON.stringify(codeRoles('portal.publish')))
  for (const [r, k] of [['admin', 'parties.manage'], ['serviceleder', 'parties.manage'], ['admin', 'portal.publish'], ['serviceleder', 'portal.publish'], ['salg', 'portal.publish']])
    ok(`migration giver ${r} ${k}`, m.includes(`('${r}', '${k}')`))

  // --- Portaler læser aldrig interne flader (uændret adfærd)
  for (const f of ['src/lib/actions/portal.ts', 'src/lib/actions/partner-portal.ts']) {
    const src = read(f)
    for (const t of ['incoming_emails', 'conversations', 'conversation_items', 'external_publications', 'case_notes', 'party_relationships', 'case_participants', 'email_intelligence_logs', 'suppliers'])
      ok(`${f} læser ikke ${t}`, !new RegExp(`from\\(['"]${t}['"]\\)`).test(src))
  }
  // Ingen kode offentliggør i dag (fundament — ingen UI/handling endnu), og ingen kalder feedet uden om readExternalFeed
  const { execSync } = await import('node:child_process')
  const grep = (pat: string) => { try { return execSync(`git grep --untracked -l -E "${pat}" -- src`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean) } catch { return [] } }
  ok('ingen src-kode kalder publish_external endnu', grep("rpc.'publish_external'").length === 0, grep("rpc.'publish_external'").join(','))
  ok('external_feed kaldes kun fra lib/parties/audience.ts', JSON.stringify(grep("'external_feed'")) === '["src/lib/parties/audience.ts"]', JSON.stringify(grep("'external_feed'")))
  ok('ingen src-kode skriver til external_publications direkte', grep("from\\('external_publications'\\)").length === 0)

  console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — parts-/publikumsfundament (rene/statiske)`)
  process.exitCode = fail ? 1 : 0
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
