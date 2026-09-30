/**
 * P-009: RLS-skrivematrix — ÉN kilde for (1) migration-SQL, (2) CI-check mod appens reelle skrivestier
 * (scripts/rls-write-sites.ts) og (3) persona-tests paa staging (scripts/test-harness/rls-lockdown.ts).
 *
 * Princip: least privilege = praecis de roller appen skriver med via bruger-sessionen (service-role/cron/portal
 * paavirkes ikke af RLS). Laesning (SELECT) aendres IKKE her (separat laese-audit: prod:role-policies).
 */
export type Role = 'admin' | 'serviceleder' | 'montør' | 'salg' | 'bogholderi'
export const ALL_ROLES: Role[] = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']

export interface TableWritePolicy {
  table: string
  insert: Role[]
  update: Role[]
  delete: Role[]
  /** Ekstra betingelse paa INSERT (AND). */
  insertExtraSql?: string
  /** Roller der KUN maa slette raekker der opfylder sql (OR-gren ud over `delete`). */
  deleteConditional?: { roles: Role[]; sql: string; desc: string }
  /** Roller der KUN maa indsaette raekker der opfylder sql (OR-gren ud over `insert`). */
  insertConditional?: { roles: Role[]; sql: string; desc: string }
  /**
   * Roller der KUN maa rette under betingelser (OR-gren ud over `update`): usingSql = hvilke raekker de maa ramme
   * (default alle), checkSql = hvordan raekken skal se ud bagefter (default uaendret krav).
   */
  updateConditional?: { roles: Role[]; usingSql?: string; checkSql?: string; desc: string }
  /**
   * Bevar anon-tabel-grants (begrundelse). Kun naar en eksisterende (godkendelses-blokeret) proces bruger anon-klienten
   * og en revoke ville aendre dens adfaerd; RLS blokerer alligevel anon (ingen anon-policies).
   */
  keepAnonGrants?: string
  /** Ekstra DDL der skal med for at laasen ikke bryder DB-triggere (scripts/prod-trigger-writes.ts). */
  extraSql?: string[]
  /** Eksisterende skrive-/ALL-policies der erstattes (praecise navne fra prod 2026-09-30). */
  dropPolicies: string[]
  /** true hvis en ALL-policy droppes -> laesning genskabes uaendret som SELECT USING (true). */
  recreateOpenSelect: boolean
  why: string
}

/** Anon-crons (P-003-familien: supplier-sync, unanswered-mails, rykker-resolvere, learning-feedback) laeser med
 *  cookie-klient = anon. En anon-revoke ville skifte tom laesning til fejl (fejllog/cron-status) — derfor bevares grants
 *  paa de tabeller de naar, indtil P-003 er besluttet. RLS blokerer alligevel al anon-skrivning (ingen anon-policies). */
export const P003 = 'anon-cron (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl'

export const WAVE1: TableWritePolicy[] = [
  {
    table: 'customers',
    keepAnonGrants: P003,
    insert: ['admin', 'serviceleder', 'salg', 'montør'],
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin'],
    dropPolicies: ['Users can create customers', 'Users can update customers', 'Users can delete customers'],
    recreateOpenSelect: false,
    why: 'opret: customers.create + offers.create + opret-fra-mail (inbox.view, inkl. montør) · ret: customers.edit/tools.pricing · slet: customers.delete',
  },
  {
    table: 'customer_contacts',
    keepAnonGrants: P003,
    insert: ['admin', 'serviceleder', 'salg', 'montør'],
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin', 'serviceleder', 'salg'],
    dropPolicies: ['Users can manage customer contacts'],
    recreateOpenSelect: true,
    why: 'customers.edit + opret-fra-mail (inbox.view) + sags-kontakt (cases.edit)',
  },
  {
    table: 'offers',
    keepAnonGrants: P003,
    insert: ['admin', 'serviceleder', 'salg'],
    insertExtraSql: 'created_by = auth.uid()',
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin'],
    deleteConditional: { roles: ['serviceleder', 'salg'], sql: 'is_proposal = true', desc: 'afvis tilbuds-forslag (offers.create)' },
    dropPolicies: ['Users can create offers', 'Users can update offers', 'Users can delete offers'],
    recreateOpenSelect: false,
    why: 'offers.create/edit/send, tools.calculations, cases.create · slet: offers.delete (admin) + afvis forslag',
  },
  {
    table: 'offer_line_items',
    insert: ['admin', 'serviceleder', 'salg'],
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin', 'serviceleder', 'salg'],
    dropPolicies: ['Users can manage line items'],
    recreateOpenSelect: true,
    why: 'offers.edit, tools.calculations, tools.ai_project',
  },
  {
    table: 'portal_access_tokens',
    keepAnonGrants: P003,
    insert: ['admin', 'serviceleder', 'salg'],
    insertExtraSql: 'created_by = auth.uid()',
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin'],
    dropPolicies: ['Employees can create portal tokens', 'Employees can update portal tokens', 'Employees can delete portal tokens'],
    recreateOpenSelect: false,
    why: 'offers.send (opret/deaktivér portal-adgang); validering sker med service-role',
  },
  {
    table: 'customer_documents',
    insert: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
    update: ['admin', 'serviceleder', 'montør', 'salg'],
    delete: ['admin'],
    dropPolicies: ['Authenticated users can manage customer documents', 'auth_all_customer_documents'],
    recreateOpenSelect: true,
    why: 'upload (customers.view = alle roller), besigtigelse/fuldmagt (service.edit), tilbud (offers.send), sag (cases.*), mail (inbox.view); sletning kun service-role i appen',
  },
  {
    table: 'incoming_emails',
    keepAnonGrants: P003,
    insert: ['admin', 'serviceleder', 'montør', 'salg'],
    update: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
    delete: ['admin'],
    dropPolicies: ['incoming_emails_insert', 'incoming_emails_update', 'incoming_emails_delete'],
    recreateOpenSelect: false,
    why: 'indsaet: sendte mails (inbox.send, offers.send, tasks.edit, customers.edit) · ret: laest/kobling (inbox.view, cases.create, customers.view) · slet: kun service-role i appen',
  },
]

/** Runde 2A: finance/arbejdsordrer, integrationer/webhooks, automation, skabeloner. */
export const WAVE2A: TableWritePolicy[] = [
  { table: 'invoice_lines', insert: [], update: [], delete: [], dropPolicies: ['invoice_lines_all_auth'], recreateOpenSelect: true,
    why: 'fakturalinjer skrives KUN af service-role (faktura-services) -> ingen REST-skrivning' },
  { table: 'invoice_predecessors', insert: [], update: [], delete: [], dropPolicies: ['invoice_predecessors_all_auth'], recreateOpenSelect: true,
    why: 'a conto-fradrag skrives KUN af service-role' },
  { table: 'work_orders', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    updateConditional: { roles: ['montør'], checkSql: "status = 'done'", desc: 'montør maa kun afslutte (work_orders.complete)' },
    dropPolicies: ['work_orders_all_auth'], recreateOpenSelect: true,
    why: 'work_orders.plan/edit/delete (admin, serviceleder); montør: work_orders.complete (kun status -> done)' },
  { table: 'work_order_profit', insert: [], update: [], delete: [], dropPolicies: ['wo_profit_all_auth'], recreateOpenSelect: true,
    // Triggere paa work_orders (status -> done) og invoices skriver profit-snapshot SOM brugeren -> ville bryde naar
    // tabellen laases. Trigger-funktionerne koeres i stedet som ejer (kan ikke kaldes direkte via API); selve
    // snapshot_work_order_profit() forbliver INVOKER, saa et direkte RPC-kald stadig afvises af RLS.
    extraSql: [
      'ALTER FUNCTION public.trg_work_order_done_snapshot_profit() SECURITY DEFINER SET search_path = public, pg_temp;',
      'ALTER FUNCTION public.trg_invoice_snapshot_profit() SECURITY DEFINER SET search_path = public, pg_temp;',
      // EXECUTE kontrolleres kun ved CREATE TRIGGER, ikke naar triggeren fyrer -> sikkert at lukke for direkte kald.
      'REVOKE ALL ON FUNCTION public.trg_work_order_done_snapshot_profit() FROM PUBLIC, anon, authenticated;',
      'REVOKE ALL ON FUNCTION public.trg_invoice_snapshot_profit() FROM PUBLIC, anon, authenticated;',
    ],
    why: 'daekningsbidrag skrives KUN af system (service-role + trigger-funktioner som ejer)' },
  { table: 'time_entries', insert: ['admin'], update: ['admin'], delete: ['admin'],
    insertConditional: { roles: ['serviceleder', 'montør'], sql: 'user_id = auth.uid()', desc: 'egne timer (time.log)' },
    updateConditional: { roles: ['serviceleder', 'montør'], usingSql: 'user_id = auth.uid()', checkSql: 'user_id = auth.uid()', desc: 'egne timer (time.edit_own)' },
    deleteConditional: { roles: ['serviceleder', 'montør'], sql: 'user_id = auth.uid()', desc: 'egne timer (time.edit_own)' },
    dropPolicies: ['Users can manage time entries'], recreateOpenSelect: true,
    why: 'time.log/time.edit_own = egne raekker; time.edit_all/time.delete = admin' },
  { table: 'integrations', insert: ['admin'], update: ['admin'], delete: ['admin'], dropPolicies: ['authenticated_manage_integrations'], recreateOpenSelect: true,
    why: 'integrations-opsaetning (settings.manage). NB: hemmelige kolonner laesbare — laese-opfoelgning (0 raekker i prod)' },
  { table: 'integration_endpoints', insert: ['admin'], update: ['admin'], delete: ['admin'], dropPolicies: ['authenticated_manage_integration_endpoints'], recreateOpenSelect: true,
    why: 'integrations-opsaetning (settings.manage)' },
  { table: 'integration_webhooks', insert: ['admin'], update: ['admin', 'serviceleder', 'salg'], delete: ['admin'], dropPolicies: ['authenticated_manage_integration_webhooks'], recreateOpenSelect: true,
    why: 'opsaetning admin; taellere opdateres naar tilbud sendes/accepteres (offers.*)' },
  { table: 'integration_queue', insert: [], update: [], delete: [], dropPolicies: ['authenticated_manage_integration_queue'], recreateOpenSelect: true,
    why: 'koe skrives KUN af service-role' },
  { table: 'integration_logs', insert: ['admin', 'serviceleder', 'salg'], update: [], delete: [], dropPolicies: ['authenticated_insert_integration_logs'], recreateOpenSelect: false,
    why: 'webhook-log fra tilbudsflow (offers.*); aldrig rettet/slettet (append-only)' },
  { table: 'external_references', insert: ['admin', 'serviceleder', 'salg'], update: ['admin', 'serviceleder', 'salg'], delete: ['admin'], dropPolicies: ['authenticated_manage_external_references'], recreateOpenSelect: true,
    why: 'eksport af tilbud til integration (offers.send)' },
  { table: 'automation_rules', insert: ['admin'], update: ['admin'], delete: ['admin'], dropPolicies: ['automation_rules_all_auth'], recreateOpenSelect: true,
    why: 'go-live/regler (admin)' },
  { table: 'automation_executions', insert: [], update: [], delete: [], dropPolicies: ['automation_executions_all_auth'], recreateOpenSelect: true,
    why: 'udfoerelseslog skrives KUN af service-role (regelmotor)' },
  { table: 'email_templates', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    dropPolicies: ['email_templates_insert', 'email_templates_update', 'email_templates_delete'], recreateOpenSelect: false,
    why: 'mailskabeloner (settings.view)' },
  { table: 'sms_templates', insert: [], update: [], delete: [], dropPolicies: ['sms_templates_insert', 'sms_templates_update', 'sms_templates_delete'], recreateOpenSelect: false,
    why: 'SMS-skabeloner skrives KUN af service-role' },
]

/** Runde 2B: leverandoerprisdata. Forudsaetning (kode): system-skrivninger fra leverandoer-API er flyttet til service-role. */
export const WAVE2B: TableWritePolicy[] = [
  { table: 'supplier_products', insert: ['admin'], update: ['admin'], delete: ['admin'], keepAnonGrants: P003,
    dropPolicies: ['Authenticated users can create supplier products', 'Authenticated users can update supplier products', 'Authenticated users can delete supplier products'],
    recreateOpenSelect: false, why: '~324k priser: kun settings.suppliers (admin); API-cache/prisopdatering skrives som service-role' },
  { table: 'supplier_product_cache', insert: [], update: [], delete: [],
    dropPolicies: ['Authenticated users can manage product cache', 'Authenticated users can update product cache'],
    recreateOpenSelect: false, why: 'offline-prisscache skrives KUN af system (service-role)' },
  { table: 'price_history', insert: ['admin'], update: [], delete: [], keepAnonGrants: P003,
    dropPolicies: ['Authenticated users can create price history'], recreateOpenSelect: false,
    why: 'prishistorik: import/sync (settings.suppliers); ellers system; append-only' },
  { table: 'supplier_sync_logs', insert: ['admin'], update: ['admin'], delete: [], keepAnonGrants: P003,
    dropPolicies: ['Authenticated users can create sync logs', 'Authenticated users can update sync logs'], recreateOpenSelect: false,
    why: 'sync-log (settings.suppliers)' },
  { table: 'supplier_sync_jobs', insert: ['admin'], update: ['admin'], delete: ['admin'],
    dropPolicies: ['Authenticated users can manage sync jobs', 'Authenticated users can update sync jobs', 'Authenticated users can delete sync jobs'],
    recreateOpenSelect: false, why: 'sync-jobs (settings.suppliers)' },
  { table: 'supplier_sync_schedules', insert: ['admin'], update: ['admin'], delete: ['admin'], keepAnonGrants: P003,
    dropPolicies: ['Authenticated users can manage sync schedules', 'Authenticated users can update sync schedules', 'Authenticated users can delete sync schedules'],
    recreateOpenSelect: false, why: 'sync-planer (settings.suppliers)' },
  { table: 'supplier_margin_rules', insert: ['admin'], update: ['admin'], delete: ['admin'],
    dropPolicies: ['Authenticated users can manage margin rules', 'Authenticated users can update margin rules', 'Authenticated users can delete margin rules'],
    recreateOpenSelect: false, why: 'prisregler (settings.suppliers)' },
  { table: 'customer_supplier_prices', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    dropPolicies: ['Authenticated users can manage customer supplier prices', 'Authenticated users can update customer supplier prices', 'Authenticated users can delete customer supplier prices'],
    recreateOpenSelect: false, why: 'kundeaftaler (tools.pricing)' },
  { table: 'customer_product_prices', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: [],
    dropPolicies: ['Authenticated users can manage customer product prices', 'Authenticated users can update customer product prices', 'Authenticated users can delete customer product prices'],
    recreateOpenSelect: false, why: 'kundepriser (tools.pricing); ingen sletning i appen' },
  { table: 'import_batches', insert: ['admin'], update: ['admin'], delete: [],
    dropPolicies: ['Authenticated users can create import batches', 'Authenticated users can update import batches'], recreateOpenSelect: false,
    why: 'CSV-import (settings.suppliers)' },
]

/** Runde 3A: sager/ordrer, projekter, leads, tilbuds-tilbehoer, signaturer, beskeder, partner-tokens. */
export const WAVE3A: TableWritePolicy[] = [
  { table: 'service_cases', insert: ['admin', 'serviceleder', 'salg', 'montør'], update: ['admin', 'serviceleder', 'salg'], delete: ['admin'],
    deleteConditional: { roles: ['serviceleder', 'salg'], sql: 'is_proposal = true', desc: 'afvis sags-forslag (cases.create)' },
    dropPolicies: ['Authenticated users can create service cases', 'Authenticated users can update service cases', 'Authenticated users can delete service cases'],
    recreateOpenSelect: false, why: 'opret: cases.create + opret-fra-mail (inbox.view) · ret: cases.edit/close + sag-fra-tilbud/mail (cases.create) · slet: cases.delete + afvis forslag' },
  { table: 'case_notes', insert: ['admin', 'serviceleder', 'salg', 'montør'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    updateConditional: { roles: ['montør'], usingSql: 'created_by = auth.uid()', checkSql: 'created_by = auth.uid()', desc: 'egne noter (cases.edit.own)' },
    deleteConditional: { roles: ['montør'], sql: 'created_by = auth.uid()', desc: 'egne noter (cases.edit.own)' },
    dropPolicies: ['case_notes_insert', 'case_notes_update', 'case_notes_delete'], recreateOpenSelect: false,
    why: 'cases.edit = alle noter; cases.edit.own = kun egne (app tjekker desuden sagsadgang)' },
  { table: 'case_materials', insert: ['admin', 'serviceleder', 'montør'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    dropPolicies: ['case_materials_all_auth'], recreateOpenSelect: true, why: 'materialer paa sag/arbejdsordre (cases.edit, work_orders.complete)' },
  { table: 'case_other_costs', insert: ['admin', 'serviceleder', 'montør'], update: ['admin', 'serviceleder'], delete: ['admin', 'serviceleder'],
    dropPolicies: ['case_other_costs_all_auth'], recreateOpenSelect: true, why: 'oevrige omkostninger paa sag (cases.edit, work_orders.complete)' },
  { table: 'customer_tasks', insert: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], update: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
    delete: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], keepAnonGrants: P003,
    dropPolicies: ['Authenticated users can manage customer tasks'], recreateOpenSelect: true,
    why: 'kundeopgaver oprettes/lukkes fra alle moduler (customers.view m.fl.); kun kendte roller' },
  { table: 'document_confirmations', insert: ['admin', 'serviceleder', 'montør'], update: ['admin', 'serviceleder', 'montør'], delete: [],
    dropPolicies: ['Authenticated full access'], recreateOpenSelect: true, why: 'bekraeftelses-anmodninger (service.edit); kundens svar sker med service-role' },
  { table: 'roof_drawings', insert: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], update: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
    delete: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], dropPolicies: ['Authenticated manage roof drawings'], recreateOpenSelect: true,
    why: 'tagtegninger paa kundekortet (customers.view = alle roller)' },
  { table: 'service_case_attachments', insert: ['admin', 'serviceleder'], update: [], delete: ['admin', 'serviceleder'],
    dropPolicies: ['Auth users manage service case attachments'], recreateOpenSelect: true, why: 'sagsbilag (cases.edit)' },
  { table: 'projects', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: ['admin'], keepAnonGrants: P003,
    // time_entries-trigger opdaterer projects.actual_hours SOM brugeren -> montørs timeregistrering ville bryde.
    // Afledt aggregat: trigger-funktionen koerer som ejer (kan ikke kaldes direkte; EXECUTE revoked).
    extraSql: [
      'ALTER FUNCTION public.update_project_actual_hours() SECURITY DEFINER SET search_path = public, pg_temp;',
      'REVOKE ALL ON FUNCTION public.update_project_actual_hours() FROM PUBLIC, anon, authenticated;',
    ],
    dropPolicies: ['Users can create projects', 'Users can update projects', 'Users can delete projects'], recreateOpenSelect: false,
    why: 'projects.create/edit/delete' },
  { table: 'project_tasks', insert: ['admin', 'serviceleder', 'montør'], update: ['admin', 'serviceleder', 'montør'], delete: ['admin', 'serviceleder'],
    dropPolicies: ['Users can manage project tasks'], recreateOpenSelect: true, why: 'tasks.create/edit (montør retter egne opgaver) · tasks.delete' },
  { table: 'quick_jobs', insert: [], update: ['admin', 'serviceleder', 'salg'], delete: [],
    dropPolicies: ['quick_jobs_insert', 'quick_jobs_update'], recreateOpenSelect: false, why: 'hurtigjob-katalog: kun statistik-opdatering fra tilbudsflow; oprettes af system' },
  { table: 'leads', insert: ['admin', 'serviceleder', 'salg', 'montør'], insertExtraSql: 'created_by = auth.uid()', update: ['admin', 'serviceleder', 'salg', 'montør'], delete: ['admin'],
    dropPolicies: ['Users can create leads', 'Users can update leads', 'Users can delete leads'], recreateOpenSelect: false,
    why: 'leads.create/edit + lead fra mail (inbox.view) · leads.delete' },
  { table: 'lead_activities', insert: ['admin', 'serviceleder', 'salg', 'montør'], update: [], delete: [],
    dropPolicies: ['Users can create lead activities'], recreateOpenSelect: false, why: 'aktivitetslog (append-only)' },
  { table: 'messages', insert: [], update: [], delete: [],
    insertConditional: { roles: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], sql: 'from_user_id = auth.uid()', desc: 'send som sig selv' },
    updateConditional: { roles: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], usingSql: 'to_user_id = auth.uid()', checkSql: 'to_user_id = auth.uid()', desc: 'modtager markerer laest' },
    deleteConditional: { roles: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'], sql: 'to_user_id = auth.uid()', desc: 'modtager sletter' },
    dropPolicies: ['Users can send messages', 'Users can update messages', 'Users can delete messages'], recreateOpenSelect: false,
    why: 'interne beskeder: egne (DELETE var aaben for alle — nu kun modtager, som appen)' },
  { table: 'sent_quotes', insert: [], update: [], delete: [],
    dropPolicies: ['Authenticated users can insert sent quotes', 'auth_insert_sent_quotes'], recreateOpenSelect: false, why: 'sendte tilbuds-PDF\'er registreres KUN af service-role' },
  { table: 'offer_signatures', insert: [], update: [], delete: [],
    dropPolicies: ['Authenticated can create signatures'], recreateOpenSelect: false,
    why: 'digitale underskrifter oprettes KUN via portal (service-role) — medarbejdere maa ikke kunne forfalske en underskrift via REST' },
  { table: 'offer_packages', insert: ['admin'], update: ['admin'], delete: ['admin'],
    dropPolicies: ['offer_packages_insert', 'offer_packages_update', 'offer_packages_delete'], recreateOpenSelect: false, why: 'tilbudspakker (admin)' },
  { table: 'offer_package_items', insert: [], update: [], delete: [],
    dropPolicies: ['offer_package_items_insert', 'offer_package_items_update', 'offer_package_items_delete'], recreateOpenSelect: false, why: 'pakkelinjer skrives KUN af service-role' },
  { table: 'offer_text_templates', insert: ['admin', 'serviceleder'], update: ['admin', 'serviceleder'], delete: [],
    dropPolicies: ['Users can manage templates', 'offer_text_templates_modify'], recreateOpenSelect: true, why: 'tilbudstekster (settings.view)' },
  { table: 'offer_generation_log', insert: ['admin', 'serviceleder', 'salg'], update: [], delete: [],
    dropPolicies: ['offer_generation_log_insert', 'offer_generation_log_update', 'offer_generation_log_delete'], recreateOpenSelect: false, why: 'AI-tilbudslog (append-only)' },
  { table: 'partner_access_tokens', insert: ['admin'], update: ['admin'], delete: [],
    dropPolicies: ['Authenticated users can manage partner tokens'], recreateOpenSelect: true,
    why: 'partnerportal-adgang (settings.manage); validering med service-role. NB: laesning af tokens er aaben — laese-opfoelgning' },
]

const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const roleList = (r: Role[]) => r.map((x) => `'${x}'`).join(', ')
const inRoles = (r: Role[]) => `public.user_role() IN (${roleList(r)})`

export function policyNames(t: string) {
  return { ins: `${t}_insert_role`, upd: `${t}_update_role`, del: `${t}_delete_role`, sel: `${t}_select_authenticated` }
}

/** Genererer migration-SQL for et saet tabeller (idempotent). */
export function generateSql(policies: TableWritePolicy[]): string {
  const out: string[] = []
  for (const p of policies) {
    const n = policyNames(p.table)
    const del = p.deleteConditional
      ? `(${inRoles(p.delete)}) OR (${inRoles(p.deleteConditional.roles)} AND ${p.deleteConditional.sql})`
      : inRoles(p.delete)
    out.push(`-- ${p.table}: ${p.why}`)
    if (p.keepAnonGrants) out.push(`-- anon-grants BEVARES midlertidigt: ${p.keepAnonGrants} (RLS blokerer stadig al anon-skrivning — ingen anon-policies)`)
    else out.push(`REVOKE ALL ON public.${p.table} FROM anon;`)
    for (const d of p.dropPolicies) out.push(`DROP POLICY IF EXISTS ${q(d)} ON public.${p.table};`)
    for (const d of [n.ins, n.upd, n.del, n.sel]) out.push(`DROP POLICY IF EXISTS ${d} ON public.${p.table};`)
    if (p.recreateOpenSelect) out.push(`CREATE POLICY ${n.sel} ON public.${p.table} FOR SELECT TO authenticated USING (true);  -- laesning uaendret`)
    // Tomme rollelister uden betingelse -> INGEN policy (= ingen skrivning via REST; kun service-role).
    const ic = p.insertConditional
    if (p.insert.length || ic) {
      const base = p.insert.length ? `${inRoles(p.insert)}${p.insertExtraSql ? ` AND ${p.insertExtraSql}` : ''}` : ''
      const cond = ic ? `${inRoles(ic.roles)} AND ${ic.sql}` : ''
      out.push(`CREATE POLICY ${n.ins} ON public.${p.table} FOR INSERT TO authenticated WITH CHECK (${base && cond ? `(${base}) OR (${cond})` : base || cond});`)
    }
    const uc = p.updateConditional
    if (p.update.length || uc) {
      if (!uc) out.push(`CREATE POLICY ${n.upd} ON public.${p.table} FOR UPDATE TO authenticated USING (${inRoles(p.update)}) WITH CHECK (${inRoles(p.update)});`)
      else {
        const part = (sql?: string) => `${inRoles(uc.roles)}${sql ? ` AND ${sql}` : ''}`
        const join = (c: string) => (p.update.length ? `(${inRoles(p.update)}) OR (${c})` : c)
        out.push(`CREATE POLICY ${n.upd} ON public.${p.table} FOR UPDATE TO authenticated USING (${join(part(uc.usingSql))}) WITH CHECK (${join(part(uc.checkSql))});`)
      }
    }
    if (p.delete.length || p.deleteConditional) {
      const delSql = p.delete.length ? del : `${inRoles(p.deleteConditional!.roles)} AND ${p.deleteConditional!.sql}`
      out.push(`CREATE POLICY ${n.del} ON public.${p.table} FOR DELETE TO authenticated USING (${delSql});`)
    }
    for (const x of p.extraSql ?? []) out.push(x)
    out.push('')
  }
  return out.join('\n')
}

if (require.main === module) console.log(generateSql(WAVE1))
