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
  /** Eksisterende skrive-/ALL-policies der erstattes (praecise navne fra prod 2026-09-30). */
  dropPolicies: string[]
  /** true hvis en ALL-policy droppes -> laesning genskabes uaendret som SELECT USING (true). */
  recreateOpenSelect: boolean
  why: string
}

export const WAVE1: TableWritePolicy[] = [
  {
    table: 'customers',
    insert: ['admin', 'serviceleder', 'salg', 'montør'],
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin'],
    dropPolicies: ['Users can create customers', 'Users can update customers', 'Users can delete customers'],
    recreateOpenSelect: false,
    why: 'opret: customers.create + offers.create + opret-fra-mail (inbox.view, inkl. montør) · ret: customers.edit/tools.pricing · slet: customers.delete',
  },
  {
    table: 'customer_contacts',
    insert: ['admin', 'serviceleder', 'salg', 'montør'],
    update: ['admin', 'serviceleder', 'salg'],
    delete: ['admin', 'serviceleder', 'salg'],
    dropPolicies: ['Users can manage customer contacts'],
    recreateOpenSelect: true,
    why: 'customers.edit + opret-fra-mail (inbox.view) + sags-kontakt (cases.edit)',
  },
  {
    table: 'offers',
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
    insert: ['admin', 'serviceleder', 'montør', 'salg'],
    update: ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
    delete: ['admin'],
    dropPolicies: ['incoming_emails_insert', 'incoming_emails_update', 'incoming_emails_delete'],
    recreateOpenSelect: false,
    why: 'indsaet: sendte mails (inbox.send, offers.send, tasks.edit, customers.edit) · ret: laest/kobling (inbox.view, cases.create, customers.view) · slet: kun service-role i appen',
  },
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
    out.push(`REVOKE ALL ON public.${p.table} FROM anon;`)
    for (const d of p.dropPolicies) out.push(`DROP POLICY IF EXISTS ${q(d)} ON public.${p.table};`)
    for (const d of [n.ins, n.upd, n.del, n.sel]) out.push(`DROP POLICY IF EXISTS ${d} ON public.${p.table};`)
    if (p.recreateOpenSelect) out.push(`CREATE POLICY ${n.sel} ON public.${p.table} FOR SELECT TO authenticated USING (true);  -- laesning uaendret`)
    out.push(`CREATE POLICY ${n.ins} ON public.${p.table} FOR INSERT TO authenticated WITH CHECK (${inRoles(p.insert)}${p.insertExtraSql ? ` AND ${p.insertExtraSql}` : ''});`)
    out.push(`CREATE POLICY ${n.upd} ON public.${p.table} FOR UPDATE TO authenticated USING (${inRoles(p.update)}) WITH CHECK (${inRoles(p.update)});`)
    out.push(`CREATE POLICY ${n.del} ON public.${p.table} FOR DELETE TO authenticated USING (${del});`)
    out.push('')
  }
  return out.join('\n')
}

if (require.main === module) console.log(generateSql(WAVE1))
