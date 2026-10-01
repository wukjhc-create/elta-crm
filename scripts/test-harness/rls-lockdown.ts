/**
 * P-009 — RLS-skrivelås verificeret med RIGTIGE rolle-sessioner (pilot-personaer) mod staging, drevet af
 * scripts/rls/write-matrix.ts. Pr. tabel og rolle: INSERT/UPDATE/DELETE paa probe-raekker skal lykkes praecis naar
 * matrixen tillader det (positive + negative checks). Derudover:
 *   - betingede grene: forslag-sletning (is_proposal), montør kun -> status 'done', egne timer (user_id = uid),
 *     INSERT med fremmed created_by/user_id afvises
 *   - anon: ingen skrivning
 *   - laesning uaendret: alle personaer kan stadig laese probe-raekken
 * Alle probe-raekker ryddes i finally (service-role).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import * as M from '../rls/write-matrix'

export interface RlsCheck { id: string; ok: boolean; note: string }

type Ctx = { stamp: number; ownerUid: string; n: () => number; s: Record<string, string> }
type Spec = {
  payload: (uid: string, c: Ctx) => Record<string, unknown>
  update: Record<string, unknown>
  /** betinget UPDATE der SKAL lykkes for updateConditional-roller */
  condUpdate?: Record<string, unknown>
  /** raekke-felter der goer raekken "egen" for personaen (usingSql/delete-betingelse) */
  ownRow?: (uid: string) => Record<string, unknown>
  /** laesning er bevidst begraenset (laese-side, fx 00175 messages: kun egne) — daekket af harness:rls-read */
  readRestricted?: boolean
  /** primaernoegle hvis ikke 'id' */
  pk?: string
}

const SPECS: Record<string, Spec> = {
  customers: {
    payload: (uid, c) => { const k = c.n(); return { customer_number: `HARN-RLS-${c.stamp}-${k}`, company_name: '[HARNESS] rls', contact_person: 'R', email: `rls-${c.stamp}-${k}@harness.test`, created_by: uid, custom_fields: { harness: 'rls' } } },
    update: { notes: '[HARNESS] rls-update' },
  },
  customer_contacts: { payload: (_u, c) => ({ customer_id: c.s.customer, name: '[HARNESS] rls' }), update: { notes: '[HARNESS] rls-update' } },
  offers: {
    payload: (uid, c) => ({ offer_number: `HARN-RLS-${c.stamp}-${c.n()}`, title: '[HARNESS] rls', created_by: uid, customer_id: c.s.customer }),
    update: { notes: '[HARNESS] rls-update' },
    ownRow: () => ({ is_proposal: true }),
  },
  offer_line_items: { payload: (_u, c) => ({ offer_id: c.s.offer, position: 900 + c.n(), description: '[HARNESS] rls', unit_price: 1, total: 1 }), update: { notes: '[HARNESS] rls-update' } },
  portal_access_tokens: {
    payload: (uid, c) => ({ customer_id: c.s.customer, token: randomBytes(24).toString('hex'), email: `rls-${c.stamp}@harness.test`, created_by: uid, expires_at: new Date(Date.now() + 3600e3).toISOString() }),
    update: { email: 'rls-upd@harness.test' },
  },
  customer_documents: { payload: (_u, c) => ({ customer_id: c.s.customer, title: '[HARNESS] rls', file_url: '', file_name: 'rls.txt', document_type: 'other' }), update: { description: '[HARNESS] rls-update' } },
  incoming_emails: { payload: (_u, c) => ({ sender_email: `rls-${c.stamp}-${c.n()}@harness.test`, subject: '[HARNESS] rls', graph_message_id: `harness-rls-${c.stamp}-${c.n()}` }), update: { is_read: true } },
  // ---- runde 2A ----
  invoice_lines: { payload: (_u, c) => ({ invoice_id: c.s.invoice, description: '[HARNESS] rls' }), update: { description: '[HARNESS] rls-update' } },
  // unik (invoice_id, predecessor_invoice_id) -> ny faktura fra puljen pr. raekke
  invoice_predecessors: { payload: (_u, c) => ({ invoice_id: c.s[`inv${c.n() % 60}`], predecessor_invoice_id: c.s.invoice2, deduction_amount: 1 }), update: { deduction_amount: 2 } },
  work_orders: { payload: () => ({ title: '[HARNESS] rls', status: 'planned' }), update: { title: '[HARNESS] rls-update' }, condUpdate: { status: 'done' } },
  work_order_profit: { payload: (_u, c) => ({ work_order_id: c.s.workOrder, source: 'manual' }), update: { source: 'recompute' } },
  time_entries: { payload: (uid, c) => ({ project_id: c.s.project, user_id: uid, hours: 1, description: '[HARNESS] rls' }), update: { hours: 2 }, ownRow: (uid) => ({ user_id: uid }) },
  integrations: { payload: (_u, c) => ({ name: `[HARNESS] rls ${c.n()}`, is_active: false }), update: { description: '[HARNESS] rls-update' } },
  integration_endpoints: { payload: (_u, c) => ({ integration_id: c.s.integration, name: '[HARNESS] rls', endpoint_path: '/harness', operation: 'harness' }), update: { name: '[HARNESS] rls-update' } },
  integration_webhooks: { payload: (_u, c) => ({ integration_id: c.s.integration, name: '[HARNESS] rls', url: 'https://example.invalid/h', event_type: 'harness.rls', is_active: false }), update: { success_count: 1 } },
  integration_queue: { payload: (_u, c) => ({ integration_id: c.s.integration, operation: 'harness', payload: {} }), update: { operation: 'harness2' } },
  integration_logs: { payload: () => ({ log_type: 'harness_rls' }), update: { log_type: 'harness_rls2' } },
  external_references: { payload: (_u, c) => ({ integration_id: c.s.integration, entity_type: 'offer', entity_id: randomUUID(), external_id: `harness-${c.n()}` }), update: { external_id: 'harness-upd' } },
  automation_rules: { payload: (_u, c) => ({ name: `[HARNESS] rls ${c.n()}`, trigger: 'harness.rls', action: 'harness.noop', active: false, dry_run: true }), update: { name: '[HARNESS] rls-update' } },
  automation_executions: { payload: (_u, c) => ({ rule_id: c.s.rule, entity_type: 'offer', entity_id: c.s.offer, status: 'dry_run' }), update: { status: 'skipped' } },
  email_templates: { payload: (_u, c) => ({ code: `harn_rls_${c.stamp}_${c.n()}`, name: '[HARNESS] rls', subject_template: 'x', body_html_template: 'x', is_active: false }), update: { name: '[HARNESS] rls-update' } },
  sms_templates: { payload: (_u, c) => ({ code: `harn_rls_${c.stamp}_${c.n()}`, name: '[HARNESS] rls', message_template: 'x', is_active: false }), update: { name: '[HARNESS] rls-update' } },
  // ---- runde 2B (leverandoerprisdata) — unikke par/noegler via puljer ----
  supplier_products: { payload: (_u, c) => ({ supplier_id: c.s.supplier, supplier_sku: `HRLS-${c.stamp}-${c.n()}`, supplier_name: '[HARNESS] rls', cost_price: 1 }), update: { cost_price: 2 } },
  supplier_product_cache: { payload: (_u, c) => ({ supplier_product_id: c.s[`sp${c.n() % 80}`], cached_cost_price: 1, cache_source: 'manual' }), update: { is_stale: true } },
  price_history: { payload: (_u, c) => ({ supplier_product_id: c.s.sp0, old_cost_price: 1, new_cost_price: 2, change_percentage: 100, change_source: 'manual' }), update: { change_percentage: 1 } },
  supplier_sync_logs: { payload: (_u, c) => ({ supplier_id: c.s.supplier, job_type: 'price_update', status: 'completed', trigger_type: 'manual' }), update: { status: 'failed' } },
  supplier_sync_jobs: { payload: (_u, c) => ({ supplier_id: c.s.supplier, job_type: 'custom', name: `[HARNESS] rls ${c.n()}`, is_active: false }), update: { name: '[HARNESS] rls-update' } },
  supplier_sync_schedules: { payload: (_u, c) => ({ supplier_id: c.s[`su${c.n() % 60}`], schedule_name: `[HARNESS] rls ${c.n()}`, sync_type: 'price_update', cron_expression: '0 0 1 1 *', is_enabled: false }), update: { schedule_name: '[HARNESS] rls-update' } },
  supplier_margin_rules: { payload: (_u, c) => ({ supplier_id: c.s.supplier, rule_type: 'supplier', margin_percentage: 10, is_active: false }), update: { margin_percentage: 11 } },
  customer_supplier_prices: { payload: (_u, c) => ({ customer_id: c.s[`cu${c.n() % 80}`], supplier_id: c.s.supplier, discount_percentage: 1, is_active: false }), update: { discount_percentage: 2 } },
  customer_product_prices: { payload: (_u, c) => ({ customer_id: c.s.customer, supplier_product_id: c.s[`sp${c.n() % 80}`], custom_cost_price: 1, source: 'manual', is_active: false }), update: { custom_cost_price: 2 } },
  import_batches: { payload: (_u, c) => ({ supplier_id: c.s.supplier, filename: 'harness-rls.csv', status: 'dry_run', is_dry_run: true }), update: { status: 'failed' } },
  // ---- runde 3A ----
  service_cases: { payload: (uid, c) => ({ title: '[HARNESS] rls', customer_id: c.s.customer, created_by: uid }), update: { title: '[HARNESS] rls-update' }, ownRow: () => ({ is_proposal: true }) },
  case_notes: { payload: (uid, c) => ({ case_id: c.s.case, content: '[HARNESS] rls', created_by: uid }), update: { content: '[HARNESS] rls-update' }, ownRow: (uid) => ({ created_by: uid }) },
  case_materials: { payload: (_u, c) => ({ case_id: c.s.case, description: '[HARNESS] rls', quantity: 1 }), update: { description: '[HARNESS] rls-update' } },
  case_other_costs: { payload: (_u, c) => ({ case_id: c.s.case, category: 'andet', description: '[HARNESS] rls', quantity: 1 }), update: { description: '[HARNESS] rls-update' } },
  customer_tasks: { payload: (uid, c) => ({ customer_id: c.s.customer, title: '[HARNESS] rls', created_by: uid }), update: { title: '[HARNESS] rls-update' } },
  document_confirmations: { payload: (_u, c) => ({ customer_document_id: c.s.document, recipient_type: 'manual', recipient_email: `rls-${c.stamp}@harness.test`, recipient_role: 'manual', expires_at: new Date(Date.now() + 3600e3).toISOString() }), update: { recipient_email: 'rls-upd@harness.test' } },
  roof_drawings: { payload: (uid, c) => ({ customer_id: c.s.customer, image_storage_path: 'harness/rls.png', image_width: 1, image_height: 1, created_by: uid }), update: { title: '[HARNESS] rls-update' } },
  service_case_attachments: { payload: (_u, c) => ({ service_case_id: c.s.case, file_name: 'rls.txt', file_url: '' }), update: { file_name: 'rls2.txt' } },
  projects: { payload: (uid, c) => ({ project_number: `HARN-RLS-P-${c.stamp}-${c.n()}`, name: '[HARNESS] rls', customer_id: c.s.customer, created_by: uid }), update: { name: '[HARNESS] rls-update' } },
  project_tasks: { payload: (uid, c) => ({ project_id: c.s.project, title: '[HARNESS] rls', created_by: uid }), update: { title: '[HARNESS] rls-update' } },
  quick_jobs: { payload: (_u, c) => ({ code: `harn_rls_${c.stamp}_${c.n()}`, name: '[HARNESS] rls' }), update: { name: '[HARNESS] rls-update' } },
  leads: { payload: (uid, c) => ({ company_name: '[HARNESS] rls', contact_person: 'R', email: `rls-${c.stamp}-${c.n()}@harness.test`, created_by: uid }), update: { notes: '[HARNESS] rls-update' } },
  lead_activities: { payload: (uid, c) => ({ lead_id: c.s.lead, activity_type: 'note', description: '[HARNESS] rls', performed_by: uid }), update: { description: '[HARNESS] rls-update' } },
  // modtager = en profil der IKKE er en af personaerne (sink), saa probe-raekker ikke tilhoerer den testede persona
  messages: { payload: (uid, c) => ({ subject: '[HARNESS] rls', body: 'x', from_user_id: uid, to_user_id: c.s.sinkUid }), update: { read_at: new Date().toISOString() }, ownRow: (uid) => ({ to_user_id: uid }), readRestricted: true },
  sent_quotes: { payload: (_u, c) => ({ quote_reference: `HARN-RLS-Q-${c.stamp}-${c.n()}`, template_type: 'sales', customer_email: `rls-${c.stamp}@harness.test`, title: '[HARNESS] rls' }), update: { title: '[HARNESS] rls-update' } },
  offer_signatures: { payload: (_u, c) => ({ offer_id: c.s[`of${c.n() % 40}`], signer_name: '[HARNESS] rls', signer_email: `rls-${c.stamp}@harness.test` }), update: { signer_name: '[HARNESS] rls-update' }, readRestricted: true },
  offer_packages: { payload: (_u, c) => ({ slug: `harn-rls-${c.stamp}-${c.n()}`, name: '[HARNESS] rls', job_type: 'harness', is_active: false }), update: { name: '[HARNESS] rls-update' } },
  offer_package_items: { payload: (_u, c) => ({ package_id: c.s.package, material_id: c.s[`mat${c.n() % 40}`] }), update: { quantity: 2 } },
  offer_text_templates: { payload: (_u, c) => ({ template_key: `harn_rls_${c.stamp}_${c.n()}`, content: 'x', is_active: false }), update: { content: 'y' } },
  offer_generation_log: { payload: () => ({ generation_type: 'harness', generated_content: {} }), update: { generation_type: 'harness2' } },
  partner_access_tokens: { payload: (uid, c) => ({ partner_customer_id: c.s.customer, token: randomBytes(24).toString('hex'), email: `rls-${c.stamp}@harness.test`, created_by: uid, is_active: false }), update: { email: 'rls-upd@harness.test' } },
  // ---- runde 3B ----
  email_messages: { payload: (_u, c) => ({ thread_id: c.s.thread, direction: 'outbound', from_email: 'rls@harness.test', to_email: 'rls-to@harness.test', subject: '[HARNESS] rls' }), update: { subject: '[HARNESS] rls-update' } },
  email_threads: { payload: () => ({ subject: '[HARNESS] rls' }), update: { subject: '[HARNESS] rls-update' } },
  email_events: { payload: (_u, c) => ({ message_id: c.s.emailMessage, event_type: 'opened' }), update: { event_type: 'clicked' } },
  sms_messages: { payload: () => ({ to_phone: '+4500000000', message: '[HARNESS] rls' }), update: { message: '[HARNESS] rls-update' } },
  sms_events: { payload: (_u, c) => ({ message_id: c.s.sms, event_type: 'sent' }), update: { event_type: 'failed' } },
  graph_sync_state: { payload: (_u, c) => ({ mailbox: `harness-rls-${c.stamp}-${c.n()}@harness.test` }), update: { last_sync_status: 'harness' } },
  email_intelligence_logs: { payload: () => ({ action: 'harness_rls' }), update: { action: 'harness_rls2' } },
  email_intelligence_daily_summary: { payload: (_u, c) => ({ summary_date: new Date(Date.UTC(1990, 0, 1) + (c.n() + (c.stamp % 5000)) * 864e5).toISOString().slice(0, 10) }), update: { total_processed: 1 } },
  ai_suggestions: { payload: () => ({ type: 'harness_rls', message: '[HARNESS] rls' }), update: { message: '[HARNESS] rls-update' } },
  ai_usage_daily: { pk: 'day', payload: (_u, c) => ({ day: new Date(Date.UTC(1980, 0, 1) + (c.n() + (c.stamp % 3000)) * 864e5).toISOString().slice(0, 10), call_count: 0 }), update: { call_count: 1 } },
  ai_prompt_templates: { payload: (_u, c) => ({ code: `harn_rls_${c.stamp}_${c.n()}`, name: '[HARNESS] rls', system_prompt: 'x', user_prompt_template: 'x', purpose: 'harness', is_active: false }), update: { name: '[HARNESS] rls-update' } },
}

/** Oprydningsraekkefoelge (boern foer foraeldre). */
const CLEANUP = ['email_events', 'email_messages', 'email_threads', 'sms_events', 'sms_messages', 'graph_sync_state', 'email_intelligence_logs',
  'email_intelligence_daily_summary', 'ai_suggestions', 'ai_usage_daily', 'ai_prompt_templates',
  'case_notes', 'case_materials', 'case_other_costs', 'service_case_attachments', 'document_confirmations', 'lead_activities', 'leads',
  'project_tasks', 'messages', 'sent_quotes', 'offer_signatures', 'offer_package_items', 'offer_packages', 'materials', 'offer_text_templates',
  'offer_generation_log', 'partner_access_tokens', 'customer_tasks', 'roof_drawings', 'quick_jobs', 'service_cases',
  'price_history', 'supplier_product_cache', 'customer_product_prices', 'customer_supplier_prices', 'supplier_margin_rules',
  'supplier_sync_logs', 'supplier_sync_jobs', 'supplier_sync_schedules', 'import_batches', 'supplier_products', 'suppliers',
  'offer_line_items', 'customer_documents', 'portal_access_tokens', 'customer_contacts', 'incoming_emails', 'external_references',
  'automation_executions', 'automation_rules', 'integration_logs', 'integration_queue', 'integration_webhooks', 'integration_endpoints', 'integrations',
  'invoice_predecessors', 'invoice_lines', 'invoices', 'work_order_profit', 'work_orders', 'time_entries', 'projects', 'email_templates', 'sms_templates',
  'offers', 'customers']

export async function runRlsLockdown(c: { admin: SupabaseClient; anon: SupabaseClient; url: string; anonKey: string; ownerUid: string }, policies: M.TableWritePolicy[] = M.WAVE1): Promise<RlsCheck[]> {
  const out: RlsCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const uids = new Map<string, string>()
  for (const [role, cl] of personas) uids.set(role, (await cl.auth.getUser()).data.user!.id)
  const stamp = Date.now()
  let counter = 0
  const created: Array<{ table: string; id: string }> = []
  const pkOf = (table: string) => SPECS[table]?.pk ?? 'id'
  const seed = async (table: string, row: Record<string, unknown>) => {
    const pk = pkOf(table)
    const { data, error } = await c.admin.from(table).insert([row]).select(pk)
    const id = (data?.[0] as Record<string, string> | undefined)?.[pk]
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.push({ table, id })
    return id
  }
  const track = (table: string, data: unknown) => { const id = (Array.isArray(data) ? (data[0] as Record<string, string>)?.[pkOf(table)] : undefined); if (id) created.push({ table, id }); return !!id }
  const has = (roles: M.Role[] | undefined, r: string) => (roles ?? []).includes(r as M.Role)
  try {
    const ctx: Ctx = { stamp, ownerUid: c.ownerUid, n: () => ++counter, s: {} }
    ctx.s.customer = await seed('customers', SPECS.customers.payload(c.ownerUid, ctx))
    ctx.s.offer = await seed('offers', SPECS.offers.payload(c.ownerUid, ctx))
    const tables = new Set(policies.map((p) => p.table))
    if (tables.has('invoice_lines') || tables.has('invoice_predecessors')) {
      ctx.s.invoice = await seed('invoices', { invoice_number: `HARN-RLS-INV-${stamp}-1`, customer_id: ctx.s.customer })
      ctx.s.invoice2 = await seed('invoices', { invoice_number: `HARN-RLS-INV-${stamp}-2`, customer_id: ctx.s.customer })
      if (tables.has('invoice_predecessors')) for (let i = 0; i < 60; i++) ctx.s[`inv${i}`] = await seed('invoices', { invoice_number: `HARN-RLS-INV-${stamp}-p${i}`, customer_id: ctx.s.customer })
    }
    if (tables.has('work_order_profit')) ctx.s.workOrder = await seed('work_orders', { title: '[HARNESS] rls-base', status: 'planned' })
    if (tables.has('time_entries')) ctx.s.project = await seed('projects', { project_number: `HARN-RLS-P-${stamp}`, name: '[HARNESS] rls', customer_id: ctx.s.customer, created_by: c.ownerUid })
    if ([...tables].some((t) => ['integration_endpoints', 'integration_webhooks', 'integration_queue', 'external_references'].includes(t)))
      ctx.s.integration = await seed('integrations', { name: `[HARNESS] rls-base ${stamp}`, is_active: false })
    if (policies.some((p) => p.table.startsWith('supplier_') || ['price_history', 'customer_supplier_prices', 'customer_product_prices', 'import_batches'].includes(p.table))) {
      ctx.s.supplier = await seed('suppliers', { name: `HARNESS RLS Leverandør ${stamp}`, code: `HSRLS${stamp}` })
      for (let i = 0; i < 80; i++) ctx.s[`sp${i}`] = await seed('supplier_products', { supplier_id: ctx.s.supplier, supplier_sku: `HRLS-P-${stamp}-${i}`, supplier_name: '[HARNESS] rls-pool', cost_price: 1 })
      if (tables.has('supplier_sync_schedules')) for (let i = 0; i < 60; i++) ctx.s[`su${i}`] = await seed('suppliers', { name: `HARNESS RLS Lev ${stamp}-${i}`, code: `HSRLS${stamp}${i}` })
      if (tables.has('customer_supplier_prices')) for (let i = 0; i < 80; i++) ctx.s[`cu${i}`] = await seed('customers', SPECS.customers.payload(c.ownerUid, ctx))
    }
    if ([...tables].some((t) => ['case_notes', 'case_materials', 'case_other_costs', 'service_case_attachments'].includes(t)))
      ctx.s.case = await seed('service_cases', { title: '[HARNESS] rls-base', customer_id: ctx.s.customer, created_by: c.ownerUid })
    if (tables.has('project_tasks') && !ctx.s.project) ctx.s.project = await seed('projects', { project_number: `HARN-RLS-P-${stamp}-base`, name: '[HARNESS] rls', customer_id: ctx.s.customer, created_by: c.ownerUid })
    if (tables.has('lead_activities')) ctx.s.lead = await seed('leads', { company_name: '[HARNESS] rls-base', contact_person: 'R', email: `rls-base-${stamp}@harness.test`, created_by: c.ownerUid })
    if (tables.has('document_confirmations')) ctx.s.document = await seed('customer_documents', { customer_id: ctx.s.customer, title: '[HARNESS] rls-base', file_url: '', file_name: 'rls.txt', document_type: 'other' })
    if (tables.has('offer_package_items')) {
      ctx.s.package = await seed('offer_packages', { slug: `harn-rls-base-${stamp}`, name: '[HARNESS] rls-base', job_type: 'harness', is_active: false })
      for (let i = 0; i < 40; i++) ctx.s[`mat${i}`] = await seed('materials', { name: `[HARNESS] rls-base ${i}`, category: 'harness' })
    }
    if (tables.has('offer_signatures')) for (let i = 0; i < 40; i++) ctx.s[`of${i}`] = await seed('offers', SPECS.offers.payload(c.ownerUid, ctx))
    if (tables.has('email_messages') || tables.has('email_events')) ctx.s.thread = await seed('email_threads', { subject: '[HARNESS] rls-base' })
    if (tables.has('email_events')) ctx.s.emailMessage = await seed('email_messages', { thread_id: ctx.s.thread, direction: 'outbound', from_email: 'rls@harness.test', to_email: 'rls-to@harness.test', subject: '[HARNESS] rls-base' })
    if (tables.has('sms_events')) ctx.s.sms = await seed('sms_messages', { to_phone: '+4500000000', message: '[HARNESS] rls-base' })
    if (tables.has('messages')) {
      const personaIds = new Set(uids.values())
      const { data: profs } = await c.admin.from('profiles').select('id').limit(50)
      const sink = ((profs ?? []) as Array<{ id: string }>).map((p) => p.id).find((id) => !personaIds.has(id))
      if (!sink) throw new Error('ingen ikke-persona-profil til messages-test')
      ctx.s.sinkUid = sink
    }
    if (tables.has('automation_executions')) ctx.s.rule = await seed('automation_rules', { name: `[HARNESS] rls-base ${stamp}`, trigger: 'harness.rls', action: 'harness.noop', active: false, dry_run: true })

    for (const p of policies) {
      const spec = SPECS[p.table]
      if (!spec) { out.push({ id: `${p.table}`, ok: false, note: 'ingen test-spec' }); continue }
      const pk = spec.pk ?? 'id'
      const mismatches: string[] = []
      let checks = 0
      const expect = (label: string, actual: boolean, expected: boolean) => { checks++; if (actual !== expected) mismatches.push(`${label}=${actual ? 'ja' : 'nej'}`) }
      for (const [role, cl] of personas) {
        const uid = uids.get(role)!
        const other = [...uids.values()].find((u) => u !== uid)!
        // INSERT (egen uid i payload)
        const ins = await cl.from(p.table).insert([spec.payload(uid, ctx)]).select(pk)
        expect(`${role}:insert`, !ins.error && track(p.table, ins.data), has(p.insert, role) || has(p.insertConditional?.roles, role))
        // INSERT med fremmed uid (ekstra betingelse / betinget gren)
        if ((p.insertExtraSql && has(p.insert, role)) || (p.insertConditional && has(p.insertConditional.roles, role) && !has(p.insert, role))) {
          const bad = await cl.from(p.table).insert([spec.payload(other, ctx)]).select(pk)
          expect(`${role}:insert(fremmed)`, !bad.error && track(p.table, bad.data), false)
        }
        // UPDATE paa en andens raekke
        const target = await seed(p.table, spec.payload(c.ownerUid === uid ? other : c.ownerUid, ctx))
        const upd = await cl.from(p.table).update(spec.update).eq(pk, target).select(pk)
        expect(`${role}:update`, !upd.error && (upd.data ?? []).length === 1, has(p.update, role))
        // laesning uaendret
        const sel = await cl.from(p.table).select(pk).eq(pk, target)
        if (!spec.readRestricted) expect(`${role}:select`, !sel.error && (sel.data ?? []).length === 1, true)
        // betinget UPDATE (fx montør -> done)
        if (p.updateConditional && spec.condUpdate) {
          const t2 = await seed(p.table, spec.payload(c.ownerUid, ctx))
          const u2 = await cl.from(p.table).update(spec.condUpdate).eq(pk, t2).select(pk)
          expect(`${role}:update(${p.updateConditional.desc})${u2.error ? `[${u2.error.message.slice(0, 80)}]` : ''}`, !u2.error && (u2.data ?? []).length === 1, has(p.update, role) || has(p.updateConditional.roles, role))
        }
        // egne raekker (usingSql / betinget delete)
        if (spec.ownRow && (p.updateConditional?.usingSql || p.deleteConditional)) {
          if (p.updateConditional?.usingSql) {
            const own = await seed(p.table, { ...spec.payload(uid, ctx), ...spec.ownRow(uid) })
            const u3 = await cl.from(p.table).update(spec.update).eq(pk, own).select(pk)
            expect(`${role}:update(egen)`, !u3.error && (u3.data ?? []).length === 1, has(p.update, role) || has(p.updateConditional.roles, role))
          }
          if (p.deleteConditional) {
            const own = await seed(p.table, { ...spec.payload(c.ownerUid, ctx), ...spec.ownRow(uid) })
            const d3 = await cl.from(p.table).delete().eq(pk, own).select(pk)
            expect(`${role}:delete(${p.deleteConditional.desc})`, !d3.error && (d3.data ?? []).length === 1, has(p.delete, role) || has(p.deleteConditional.roles, role))
          }
        }
        // DELETE paa en andens / almindelig raekke
        const del = await cl.from(p.table).delete().eq(pk, target).select(pk)
        expect(`${role}:delete`, !del.error && (del.data ?? []).length === 1, has(p.delete, role))
      }
      // anon
      const aIns = await c.anon.from(p.table).insert([spec.payload(c.ownerUid, ctx)]).select(pk)
      const aTarget = await seed(p.table, spec.payload(c.ownerUid, ctx))
      const aUpd = await c.anon.from(p.table).update(spec.update).eq(pk, aTarget).select(pk)
      const aDel = await c.anon.from(p.table).delete().eq(pk, aTarget).select(pk)
      expect('anon:skriv', (!aIns.error && track(p.table, aIns.data)) || (!aUpd.error && (aUpd.data ?? []).length > 0) || (!aDel.error && (aDel.data ?? []).length > 0), false)
      const summary = `I:${p.insert.length}${p.insertConditional ? '+b' : ''}/U:${p.update.length}${p.updateConditional ? '+b' : ''}/D:${p.delete.length}${p.deleteConditional ? '+b' : ''}`
      out.push({ id: p.table, ok: mismatches.length === 0 && personas.size === 5, note: mismatches.length ? `AFVIGER: ${mismatches.join(', ')}` : `${checks} checks · ${summary} · ${personas.size} personaer + anon` })
    }
  } finally {
    for (const t of CLEANUP) {
      const ids = created.filter((x) => x.table === t).map((x) => x.id)
      if (ids.length) {
        const { error } = await c.admin.from(t).delete().in(pkOf(t), ids)
        if (error) console.error(`[rls-lockdown] oprydning ${t}: ${error.message}`)
      }
    }
  }
  return out
}

export function formatRlsLockdown(c: RlsCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'P-009 RLS-SKRIVELÅS (rigtige rolle-sessioner):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(24)} ${x.note}`),
    bad ? `  ❌ ${bad} tabel(ler) afviger` : `  ✅ alle ${c.length} tabeller som matrixen`].join('\n')
}
