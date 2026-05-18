/**
 * Sprint 9F Phase 6a — Smoketest (read-only).
 *
 * Verificerer pure-funktioner i routing-preview uden at ramme DB
 * eller starte Next.js runtime. Koeres med:
 *   npx tsx scripts/smoketest-phase-6a.ts
 *
 * Hvad testen daekker:
 *  1. isShadowLogEnabled() respekterer MAIL_ROUTING_SHADOW_LOG env.
 *  2. buildShadowLogMeta() producerer korrekt shape.
 *  3. Sammenlignings-logik via konstrueret preview-objekt.
 *  4. Type-imports og module-loading kraher ikke.
 *
 * IKKE i scope:
 *  - Faktisk DB-loading af service-case (kraever Supabase).
 *  - Faktisk send-mail (Graph API).
 *  - Browser-UI-trigger.
 */

import {
  isShadowLogEnabled,
  buildShadowLogMeta,
} from '../src/lib/actions/service-case-route-preview'
import type {
  RoutePreview,
  RoutingDivergence,
} from '../src/lib/services/mail-routing'

let passed = 0
let failed = 0
const issues: string[] = []

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
    issues.push(`${name}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

async function testIsShadowLogEnabled() {
  console.log('\n[1] isShadowLogEnabled() respekterer env-flag')
  const original = process.env.MAIL_ROUTING_SHADOW_LOG

  // Off-cases
  delete process.env.MAIL_ROUTING_SHADOW_LOG
  check('undefined -> false', (await isShadowLogEnabled()) === false)

  process.env.MAIL_ROUTING_SHADOW_LOG = ''
  check('tom streng -> false', (await isShadowLogEnabled()) === false)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'false'
  check("'false' -> false", (await isShadowLogEnabled()) === false)

  process.env.MAIL_ROUTING_SHADOW_LOG = '0'
  check("'0' -> false", (await isShadowLogEnabled()) === false)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'random-garbage'
  check('ukendt vaerdi -> false', (await isShadowLogEnabled()) === false)

  // On-cases
  process.env.MAIL_ROUTING_SHADOW_LOG = '1'
  check("'1' -> true", (await isShadowLogEnabled()) === true)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'true'
  check("'true' -> true", (await isShadowLogEnabled()) === true)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'TRUE'
  check("'TRUE' (case-insensitive) -> true", (await isShadowLogEnabled()) === true)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'yes'
  check("'yes' -> true", (await isShadowLogEnabled()) === true)

  process.env.MAIL_ROUTING_SHADOW_LOG = 'on'
  check("'on' -> true", (await isShadowLogEnabled()) === true)

  process.env.MAIL_ROUTING_SHADOW_LOG = '  true  '
  check('trimmed value -> true', (await isShadowLogEnabled()) === true)

  if (original === undefined) delete process.env.MAIL_ROUTING_SHADOW_LOG
  else process.env.MAIL_ROUTING_SHADOW_LOG = original
}

function makePreview(divergence: RoutingDivergence): RoutePreview {
  const sameEmail = 'kunde@example.com'
  const diffEmail = 'lejer@example.com'
  const current = {
    toEmail: sameEmail,
    recipientRole: 'paying_customer' as const,
    reason: 'Fallback til customer.email',
  }
  let recommended: RoutePreview['recommended']
  let divergenceReason = ''
  switch (divergence) {
    case 'none':
      recommended = {
        toEmail: sameEmail,
        recipientRole: 'paying_customer',
        intent: 'task_practical',
        reason: 'Phase 6a recommend: customer (sagspartner-prioritet)',
      }
      divergenceReason = 'Nuvaerende og anbefalet route er identiske'
      break
    case 'role_only':
      recommended = {
        toEmail: sameEmail,
        recipientRole: 'site_contact',
        intent: 'task_practical',
        reason: 'Phase 6a recommend: site_contact (sagspartner-prioritet)',
      }
      divergenceReason = 'Samme email, anden rolle-label: paying_customer -> site_contact'
      break
    case 'recipient':
      recommended = {
        toEmail: diffEmail,
        recipientRole: 'site_contact',
        intent: 'task_practical',
        reason: 'Phase 6a recommend: site_contact (sagspartner-prioritet)',
        resolvedFromContactId: 'aaaa-bbbb-cccc',
      }
      divergenceReason = `Recipient ville aendres: ${sameEmail} -> ${diffEmail}`
      break
    case 'error':
      recommended = {
        toEmail: null,
        recipientRole: 'unresolved',
        intent: 'task_practical',
        reason: 'Phase 6a recommend: ingen ekstern email fundet paa nogen sagspartner',
        unresolved: true,
        errorCode: 'NO_PARTY_EMAIL',
      }
      divergenceReason = recommended.reason
      break
  }
  return {
    current,
    recommended,
    divergence,
    divergenceReason,
    partyRoles: {
      customerId: 'c1',
      ordererCustomerId: 'c1',
      endCustomerId: 'c1',
      payerCustomerId: 'c1',
      siteCustomerId: null,
      siteContactId: divergence === 'role_only' || divergence === 'recipient' ? 'cc1' : null,
      purchasedFromCustomerId: null,
      billingMode: 'same_as_customer',
    },
  }
}

async function testBuildShadowLogMeta() {
  console.log('\n[2] buildShadowLogMeta() shape og felter')

  const preview = makePreview('recipient')
  const meta = await buildShadowLogMeta(preview)

  check('meta.shadow_only === true', meta.shadow_only === true)
  check(
    'meta.routing_divergence === "recipient"',
    meta.routing_divergence === 'recipient'
  )
  check(
    'meta.party_roles indeholder customer-id',
    meta.party_roles?.customerId === 'c1'
  )
  check(
    'meta.party_roles indeholder site_contact_id',
    meta.party_roles?.siteContactId === 'cc1'
  )
  check(
    'meta.current_route har korrekt email',
    meta.current_route?.to === 'kunde@example.com'
  )
  check(
    'meta.current_route har korrekt rolle',
    meta.current_route?.role === 'paying_customer'
  )
  check(
    'meta.recommended_route har anden email end current',
    meta.recommended_route?.to === 'lejer@example.com'
  )
  check(
    'meta.recommended_route.role === site_contact',
    meta.recommended_route?.role === 'site_contact'
  )
  check(
    'meta.divergence_reason er ikke tom',
    typeof meta.divergence_reason === 'string' && meta.divergence_reason.length > 0
  )

  // none-case
  const noDivPreview = makePreview('none')
  const noDivMeta = await buildShadowLogMeta(noDivPreview)
  check('none-case: divergence = "none"', noDivMeta.routing_divergence === 'none')
  check(
    'none-case: recommended.to === current.to',
    noDivMeta.recommended_route?.to === noDivMeta.current_route?.to
  )

  // role_only-case
  const rolePreview = makePreview('role_only')
  const roleMeta = await buildShadowLogMeta(rolePreview)
  check('role_only: divergence = "role_only"', roleMeta.routing_divergence === 'role_only')
  check(
    'role_only: emails matcher men roller adskiller sig',
    roleMeta.current_route?.to === roleMeta.recommended_route?.to &&
      roleMeta.current_route?.role !== roleMeta.recommended_route?.role
  )

  // error-case
  const errPreview = makePreview('error')
  const errMeta = await buildShadowLogMeta(errPreview)
  check('error-case: divergence = "error"', errMeta.routing_divergence === 'error')
  check(
    'error-case: recommended.to er null',
    errMeta.recommended_route?.to === null
  )
  check(
    'error-case: error_code propageret',
    errMeta.recommended_route?.error_code === 'NO_PARTY_EMAIL'
  )
}

async function testJsonSerializable() {
  console.log('\n[3] meta-objekt er JSON-serialiserbart (logger kraver det)')
  const preview = makePreview('recipient')
  const meta = await buildShadowLogMeta(preview)
  try {
    const json = JSON.stringify(meta)
    check('JSON.stringify lykkes', typeof json === 'string' && json.length > 0)
    const parsed = JSON.parse(json)
    check(
      'round-trip bevarer shadow_only',
      parsed.shadow_only === true
    )
    check(
      'round-trip bevarer party_roles',
      typeof parsed.party_roles === 'object' && parsed.party_roles !== null
    )
  } catch (err) {
    check('JSON serialisering', false, String(err))
  }
}

async function main() {
  console.log('=== Sprint 9F Phase 6a smoketest ===')
  await testIsShadowLogEnabled()
  await testBuildShadowLogMeta()
  await testJsonSerializable()

  console.log(`\nResultat: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFejl:')
    for (const i of issues) console.log(`  - ${i}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('Uventet fejl i smoketest:', err)
  process.exit(2)
})
