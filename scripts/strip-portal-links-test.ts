/**
 * PM-1/PM-2 (portal-review 2026-10-17): portal-links fjernes fra mails til en anden part end linkets kunde. Ren logik.
 *   npx tsx scripts/strip-portal-links-test.ts
 */
import { stripPortalLinks, containsPortalLink } from '../src/lib/portal/strip-portal-links'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const tok = 'a'.repeat(64)
const cta = `<td><a href="https://elta-crm.vercel.app/portal/${tok}/offers/123" target="_blank" style="color:#fff">Se dit tilbud her &#8594;</a></td>`
const text = `Se tilbuddet: https://elta-crm.vercel.app/portal/${tok}/offers/123\nMvh Elta`

ok(containsPortalLink(cta), 'genkender portal-link i knap')
ok(containsPortalLink(cta), 'containsPortalLink kan kaldes flere gange (lastIndex nulstilles)')
const stripped = stripPortalLinks(cta, '<span>Tilbuddet er vedhæftet som PDF.</span>')
ok(!stripped.includes(tok) && stripped.includes('vedhæftet som PDF') && !stripped.includes('Se dit tilbud her'), 'hele knappen erstattes', stripped)
ok(!stripPortalLinks(text).includes(tok) && stripPortalLinks(text).includes('Mvh Elta'), 'løs URL i tekst fjernes, resten bevares')
ok(!containsPortalLink('<a href="https://elta-crm.vercel.app/dashboard/offers/1">intern</a>'), 'andre links berøres ikke')
ok(stripPortalLinks('<p>Ingen links</p>') === '<p>Ingen links</p>', 'uden portal-link uændret')
const svc = `<p><a href="https://elta-crm.vercel.app/portal/${tok}" style="display:inline-block">Se status i kundeportalen</a></p>`
ok(stripPortalLinks(svc) === '<p></p>', 'servicemail: knappen fjernes helt', stripPortalLinks(svc))

console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
