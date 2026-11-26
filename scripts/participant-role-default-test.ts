/**
 * TECH-PARTY-ROLE-1 — standardrolle i Sagsdeltagere-panelet (ren logik + statisk tjek af panelet, ingen DB).
 *   npx tsx scripts/participant-role-default-test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FALLBACK_PARTICIPANT_ROLE,
  initialParticipantSelection,
  participantOptionKey,
  roleForOption,
  type RoleOption,
} from '../src/lib/parties/participant-role-default'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }

const kunde: RoleOption = { register: 'customer', id: 'c1', defaultRole: 'customer' }
const slut: RoleOption = { register: 'customer', id: 'c2', defaultRole: 'end_customer' }
const kontakt: RoleOption = { register: 'customer_contact', id: 'k1', defaultRole: 'site_contact' }
const kobssted: RoleOption = { register: 'customer', id: 'c3', defaultRole: 'cooperation_partner' }

// Én mulighed (fejlen): "Fra sagen" giver Kunde uden onChange
ok('én mulighed: Fra sagen → Kunde', initialParticipantSelection('case', [kunde]).role === 'customer')
ok('én mulighed: mulighed forvalgt', initialParticipantSelection('case', [kunde]).optionKey === 'customer:c1')
ok('én kontakt-mulighed → Kontakt på stedet', initialParticipantSelection('case', [kontakt]).role === 'site_contact')
// Flere muligheder: første + dens rolle, skift følger muligheden
const many = [kunde, slut, kontakt, kobssted]
ok('flere: første mulighed + Kunde', JSON.stringify(initialParticipantSelection('case', many)) === JSON.stringify({ optionKey: 'customer:c1', role: 'customer' }))
ok('skift → slutkunde', roleForOption(many, participantOptionKey(slut)) === 'end_customer')
ok('skift → kontakt', roleForOption(many, participantOptionKey(kontakt)) === 'site_contact')
ok('skift → købssted = samarbejdspartner', roleForOption(many, participantOptionKey(kobssted)) === 'cooperation_partner')
ok('ukendt nøgle → generisk', roleForOption(many, 'customer:zzz') === FALLBACK_PARTICIPANT_ROLE)
ok('register indgår i nøglen (kontakt ≠ kunde med samme id)', roleForOption([kunde, { register: 'customer_contact', id: 'c1', defaultRole: 'site_contact' }], 'customer_contact:c1') === 'site_contact')
// Nulstilling: hver åbning er uafhængig af forrige valg (funktionen er ren — ingen tidligere tilstand indgår)
ok('nulstilling: Fra sagen igen → Kunde', initialParticipantSelection('case', many).role === 'customer')
ok('Eksisterende part → generisk', initialParticipantSelection('search', many).role === FALLBACK_PARTICIPANT_ROLE)
ok('Ny part → generisk', initialParticipantSelection('new', many).role === FALLBACK_PARTICIPANT_ROLE)
ok('ingen muligheder → generisk + tom nøgle', JSON.stringify(initialParticipantSelection('case', [])) === JSON.stringify({ optionKey: '', role: FALLBACK_PARTICIPANT_ROLE }))
ok('generisk = samarbejdspartner', FALLBACK_PARTICIPANT_ROLE === 'cooperation_partner')

// Statisk: panelet bruger helperen ved hver åbning, og rollen kan stadig ændres manuelt
const panel = readFileSync(resolve(process.cwd(), 'src/components/modules/parties/case-participants-panel.tsx'), 'utf8')
ok('panel: ingen direkte setMode(\'case\'|\'search\'|\'new\') fra knapper', !/setMode\('(case|search|new)'\)/.test(panel))
ok('panel: tre knapper åbner via openMode', (panel.match(/openMode\('(case|search|new)'\)/g) ?? []).length === 3)
ok('panel: openMode nulstiller rolle + mulighed', /function openMode[\s\S]{0,300}setOptionKey\(init\.optionKey\)[\s\S]{0,80}setRole\(init\.role\)/.test(panel))
ok('panel: skift af mulighed sætter rolle', /setRole\(roleForOption\(caseOptions, e\.target\.value\)\)/.test(panel))
ok('panel: manuel rollevælger findes', /data-testid="participant-role"/.test(panel) && /onChange=\{\(e\) => setRole\(e\.target\.value as CaseParticipantRole\)\}/.test(panel))
ok('panel: ingen hårdkodet standardrolle', !/useState<CaseParticipantRole>\('cooperation_partner'\)/.test(panel))

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — standardrolle i sagsdeltagere (TECH-PARTY-ROLE-1)`)
process.exitCode = fail ? 1 : 0
