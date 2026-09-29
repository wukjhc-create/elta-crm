/**
 * Negativ-/positivtest af den strenge RBAC-audit (P-006). Bygger fixtures i en temp-mappe og beviser, at
 * audit FEJLER paa hver type overtraedelse — saa et groent resultat paa rigtig kode betyder noget.
 *   npx tsx scripts/action-gate-audit-test.ts
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runStrictAudit } from './action-gate-audit'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

const root = mkdtempSync(join(tmpdir(), 'gate-audit-'))
const actions = join(root, 'lib', 'actions')
const comps = join(root, 'components')
mkdirSync(actions, { recursive: true })
mkdirSync(comps, { recursive: true })
const action = (name: string, body: string) => writeFileSync(join(actions, name), `'use server'\n${body}\n`)
const client = (name: string, body: string) => writeFileSync(join(comps, name), `'use client'\n${body}\n`)

try {
  action('a.ts', `
export async function gatedWrite() {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission('x.edit')
  await ctx.supabase.from('t').update({ a: 1 })
}
export async function ungatedWrite() {
  const { supabase } = await getAuthenticatedClient()
  await supabase.from('t').delete().eq('id', 1)
}
export async function readOnly() {
  await supabase.from('t').select('*')
}
export async function helperOnly() {
  await supabase.from('t').insert({})
}
export async function fakeToken(token: string) {
  await supabase.from('t').update({ a: 1 }).eq('id', token)
}
export async function realToken(token: string) {
  const s = await validatePortalToken(token)
  await supabase.from('t').update({ a: 1 })
}
export async function fakeSelf(id: string) {
  const { userId } = await getAuthenticatedClient()
  await supabase.from('t').update({ a: 1 }).eq('id', id)
}
export async function realSelf() {
  const { userId } = await getAuthenticatedClient()
  await supabase.from('profiles').update({ a: 1 }).eq('id', userId)
}
export async function indirectServiceWrite(id: string) {
  const { processEmailAttachments } = await import('@/lib/services/email-attachment-storage')
  await processEmailAttachments(id, 'g')
}
export async function storageUpload(p: string) {
  await supabase.storage.from('attachments').upload(p, new Blob())
}`)
  client('c.tsx', `import { helperOnly } from '@/lib/actions/a'\nexport default function C() { return helperOnly }`)

  const r = runStrictAudit(actions, {
    'a.ts:helperOnly': { kind: 'server-only', reason: 'påstået server-only' },
    'a.ts:fakeToken': { kind: 'token', reason: 'påstået token' },
    'a.ts:realToken': { kind: 'token', reason: 'validerer portal-token' },
    'a.ts:fakeSelf': { kind: 'self', reason: 'påstået self' },
    'a.ts:realSelf': { kind: 'self', reason: 'egen profil' },
    'a.ts:gatedWrite': { kind: 'self', reason: 'overflødig undtagelse' },
    'a.ts:doesNotExist': { kind: 'server-only', reason: 'forældet' },
  }, root)
  const has = (re: RegExp) => r.failures.some((f) => re.test(f))

  assert(has(/a\.ts:ungatedWrite: skrivende action uden rettighedstjek/), 'ny ugatet skrivende action fejler')
  assert(has(/a\.ts:indirectServiceWrite: skrivende action uden rettighedstjek/), 'ugatet indirekte skrivning via service fejler')
  assert(has(/a\.ts:storageUpload: skrivende action uden rettighedstjek/), 'ugatet storage-upload fejler')
  assert(has(/a\.ts:helperOnly: markeret server-only, men refereres fra klientkode/), 'server-only der bruges i klientkode fejler')
  assert(has(/a\.ts:fakeToken: markeret token, men validerer intet token/), 'falsk token-påstand fejler')
  assert(!has(/a\.ts:realToken/), 'ægte token-validering godkendes')
  assert(has(/a\.ts:fakeSelf: markeret self/), 'falsk self-påstand (andres id) fejler')
  assert(!has(/a\.ts:realSelf/), 'ægte egne-data godkendes')
  assert(has(/a\.ts:gatedWrite: undtaget men nu gatet/), 'overflødig undtagelse på gatet action fejler (stale)')
  assert(has(/a\.ts:doesNotExist: undtagelse for en action der ikke/), 'undtagelse for ikke-eksisterende action fejler (stale)')
  assert(!has(/readOnly/), 'ren læsning ignoreres')
  assert(r.scanned === 9, 'skrivende actions tælles korrekt', String(r.scanned))
} finally {
  rmSync(root, { recursive: true, force: true })
}

// Rigtig kode skal vaere groen
const real = runStrictAudit()
assert(real.failures.length === 0, 'den rigtige kodebase: 0 fejl', `${real.gated} gatet · ${real.exempt} undtaget${real.failures.length ? ' · ' + real.failures.slice(0, 2).join(' | ') : ''}`)

console.log(`\n${fails === 0 ? '✅ ALLE RBAC-AUDIT-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
