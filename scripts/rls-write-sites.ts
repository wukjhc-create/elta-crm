/**
 * P-009: statisk kortlaegning af ALLE skrivninger pr. tabel via TypeScript-compilerens AST — hvilken klient
 * (bruger-session vs service-role), hvilken operation og hvilken app-permission der gater den. Grundlag for
 * RLS-skrivepolicies der praecis matcher app-adfaerden (ellers bryder en lockdown legitime flows). Ingen DB.
 *
 *   npx tsx scripts/rls-write-sites.ts [tabel ...]        (default: P-009 boelge 1)
 *   npx tsx scripts/rls-write-sites.ts --json tabel ...
 *
 * Klient pr. skrivning (modtageren af .from(...) opløses til sin erklaering):
 *   admin   = createAdminClient / getServiceClient / service-role  -> RLS gaelder ikke
 *   user    = createClient (server) / getAuthenticatedClient... / requireGate / require...Write -> RLS gaelder
 *   browser = @/lib/supabase/client (klient-komponent)             -> RLS gaelder
 *   param   = klienten er en parameter -> kalderne afgoer (listes til manuel vurdering)
 * Gate: permissions i den YDERSTE funktion der indeholder skrivningen (requireGate/gateDenied/requirePermission/...).
 */
import ts from 'typescript'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { PERMISSIONS } from '../src/lib/auth/permissions'

export type ClientKind = 'admin' | 'user' | 'browser' | 'param' | 'unknown'
export interface WriteSite { table: string; op: string; file: string; line: number; fn: string; client: ClientKind; clientExpr: string; perms: string[]; adminOnlyGate: boolean }

export const WAVE1 = ['customers', 'customer_contacts', 'offers', 'offer_line_items', 'portal_access_tokens', 'customer_documents', 'incoming_emails']
const OPS = new Set(['insert', 'update', 'upsert', 'delete'])
const ADMIN_RE = /createAdminClient|getServiceClient|createServiceClient|createServiceRoleClient|SERVICE_ROLE|getAdminClient|supabaseAdmin|adminFor\(|\bctx\.admin\b|^admin$/
const USER_RE = /\bcreateClient\(\)|getAuthenticatedClient\w*|requireGate|require\w*Write|requireAuth\w*|require\w*Permission\w*|createServerClient|getSupabase\w*/
const BROWSER_RE = /createBrowserClient|lib\/supabase\/client/
const PERM_RE = /(?:permissionDenied|requireGate|gateDenied|requirePermission|hasPermission|assertPermission|pageHasPermission)\(\s*['"]([a-z_.]+)['"]/g
const ADMIN_GATE_RE = /requireAdmin\w*\(|['"]admin['"]\s*!==?\s*\w*role|role\s*!==?\s*['"]admin['"]/

/** Funktioner med ekstern effekt (sender mail/SMS, skubber til e-conomic). */
export const EFFECT_SEEDS = ['sendEmailViaGraph', 'sendInvoiceEmail', 'sendInvoiceReminder', 'sendAdminAlert', 'sendSms', 'sendSmsMessage',
  'sendExportErrorNotification', 'sendPaymentReport', 'pushInvoiceToEconomic', 'createCustomerInEconomic']
const GENERIC_NAMES = new Set(['handler', 'POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'execute', 'run', 'main', '(anon)', 'default'])

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p, out) }
    else if (/\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p)
  }
  return out
}

function isFn(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)
}
function fnName(n: ts.Node): string {
  if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText()
  if (ts.isVariableDeclaration(n.parent) ) return n.parent.name.getText()
  if (ts.isPropertyAssignment(n.parent)) return n.parent.name.getText()
  return '(anon)'
}

export function scanWriteSites(root = join(process.cwd(), 'src'), tables?: string[]): WriteSite[] {
  const files = walk(root)
  const program = ts.createProgram(files, { allowJs: false, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: process.cwd(), paths: { '@/*': ['src/*'] }, noEmit: true, skipLibCheck: true })
  const checker = program.getTypeChecker()
  const sites: WriteSite[] = []

  const classifyExpr = (expr: ts.Expression, sf: ts.SourceFile): { kind: ClientKind; text: string } => {
    let e: ts.Expression = expr
    while (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = (e as any).expression
    const text = e.getText(sf)
    if (ts.isCallExpression(e)) {
      const t = e.getText(sf)
      return { kind: ADMIN_RE.test(t) ? 'admin' : BROWSER_RE.test(t) ? 'browser' : USER_RE.test(t) ? 'user' : 'unknown', text: t.slice(0, 60) }
    }
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) === false) return classifyExpr(e.expression, sf)
    const ident = ts.isIdentifier(e) ? e : ts.isPropertyAccessExpression(e) ? e.name : null
    if (!ident) return { kind: 'unknown', text }
    const sym = checker.getSymbolAtLocation(ident)
    const decl = sym?.valueDeclaration ?? sym?.declarations?.[0]
    if (!decl) return { kind: 'unknown', text }
    if (ts.isParameter(decl)) return { kind: 'param', text }
    // const { supabase } = await requireGate(...)  |  const supabase = createAdminClient()
    let init: ts.Node | undefined
    if (ts.isVariableDeclaration(decl)) init = decl.initializer
    else if (ts.isBindingElement(decl)) { let p: ts.Node = decl; while (p && !ts.isVariableDeclaration(p)) p = p.parent; init = (p as ts.VariableDeclaration)?.initializer }
    else if (ts.isShorthandPropertyAssignment(decl) || ts.isImportSpecifier(decl)) init = decl
    if (!init) return { kind: 'unknown', text }
    const it = init.getText(sf)
    const kind: ClientKind = ADMIN_RE.test(it) ? 'admin' : BROWSER_RE.test(it) ? 'browser' : USER_RE.test(it) ? 'user' : 'unknown'
    // simpel videreførsel: const db = supabase
    if (kind === 'unknown' && ts.isIdentifier(init) && init !== ident) return classifyExpr(init, sf)
    return { kind, text: `${text} = ${it.slice(0, 50)}` }
  }

  // Kald-graf: funktionsnavn -> kaldesteder (til opløsning af param-/service-skrivninger via kalderne).
  const calls = new Map<string, Array<{ sf: ts.SourceFile; call: ts.CallExpression }>>()
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !/[\\/]src[\\/]/.test(sf.fileName)) continue
    const v = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null
        if (callee) { const arr = calls.get(callee) ?? []; arr.push({ sf, call: n }); calls.set(callee, arr) }
      }
      ts.forEachChild(n, v)
    }
    v(sf)
  }
  const outerFn = (n: ts.Node): ts.Node | undefined => { let o: ts.Node | undefined, p: ts.Node | undefined = n.parent; while (p) { if (isFn(p)) o = p; p = p.parent } return o }
  /** Opløs en funktions kaldere (op til `depth` niveauer): hvilke klienter + gates kalder den? */
  const resolveCallers = (name: string, depth: number, seen = new Set<string>()): Array<{ via: string; client: ClientKind; perms: string[]; adminOnlyGate: boolean }> => {
    // Generiske navne giver falske kald-kanter (fx 'handler' i capability-registret) — oploeses ikke via navn.
    if (depth <= 0 || seen.has(name) || GENERIC_NAMES.has(name)) return []
    seen.add(name)
    const out: Array<{ via: string; client: ClientKind; perms: string[]; adminOnlyGate: boolean }> = []
    for (const { sf, call } of calls.get(name) ?? []) {
      const o = outerFn(call)
      const body = o ? o.getText(sf) : ''
      const perms = [...new Set([...body.matchAll(PERM_RE)].map((m) => m[1]))]
      const argKinds = call.arguments.map((a) => classifyExpr(a, sf).kind).filter((k) => k !== 'unknown')
      const client: ClientKind = argKinds.includes('user') ? 'user' : argKinds.includes('browser') ? 'browser' : argKinds.includes('admin') ? 'admin' : argKinds.includes('param') ? 'param' : 'unknown'
      const via = `${relative(process.cwd(), sf.fileName).split('\\').join('/')}:${sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1} ${o ? fnName(o) : '(modul)'}`
      if ((client === 'param' || (client === 'unknown' && perms.length === 0)) && o) {
        const up = resolveCallers(fnName(o), depth - 1, seen)
        if (up.length) { out.push(...up.map((u) => ({ ...u, via: `${u.via} → ${via}` }))); continue }
      }
      out.push({ via, client, perms, adminOnlyGate: ADMIN_GATE_RE.test(body) })
    }
    return out
  }

  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.includes('/src/') && !sf.fileName.includes('\\src\\')) continue
    if (sf.isDeclarationFile) continue
    const isClientComp = /^\s*['"]use client['"]/.test(sf.text)
    const visit = (n: ts.Node) => {
      // .from('t').op(...)
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'from'
        && n.arguments.length === 1 && ts.isStringLiteralLike(n.arguments[0])) {
        const table = n.arguments[0].text
        const parent = n.parent
        if ((!tables || tables.includes(table)) && ts.isPropertyAccessExpression(parent) && OPS.has(parent.name.text) && ts.isCallExpression(parent.parent)) {
          const receiver = n.expression.expression
          const recvText = receiver.getText(sf)
          if (!/\.storage$|^storage$/.test(recvText)) {
            let { kind, text } = classifyExpr(receiver, sf)
            if (kind === 'unknown' && isClientComp) kind = 'browser'
            // yderste funktion (gate) + inderste funktion (navn)
            let inner: ts.Node | undefined, outer: ts.Node | undefined, p: ts.Node | undefined = n.parent
            while (p) { if (isFn(p)) { inner ??= p; outer = p } p = p.parent }
            const body = outer ? outer.getText(sf) : ''
            const perms = [...new Set([...body.matchAll(PERM_RE)].map((m) => m[1]))]
            const base = { table, op: parent.name.text, file: relative(process.cwd(), sf.fileName).split('\\').join('/'),
              line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, fn: outer ? fnName(outer) + (inner && inner !== outer ? `>${fnName(inner)}` : '') : '(modul)' }
            const needsCallers = outer && (kind === 'param' || ((kind === 'user' || kind === 'unknown') && perms.length === 0 && !ADMIN_GATE_RE.test(body)))
            const via = needsCallers ? resolveCallers(fnName(outer!), 4) : []
            if (via.length) {
              for (const v of via) sites.push({ ...base, fn: `${base.fn} ⇐ ${v.via}`, client: kind === 'param' ? v.client : (v.client === 'admin' ? 'admin' : kind), clientExpr: text, perms: v.perms, adminOnlyGate: v.adminOnlyGate })
            } else {
              sites.push({ ...base, client: kind, clientExpr: text, perms, adminOnlyGate: ADMIN_GATE_RE.test(body) })
            }
          }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  // Transitiv lukning: bibliotek-funktioner (uden for actions/app) der skriver, ELLER kalder en saadan. Bruges af
  // RBAC-auditten som "indirekte skrivere" (fx bank-payments.autoMatchTransactions -> applyMatch -> invoices).
  // Alle src-filer (ogsaa hjaelpere i action-filer, fx customer-mailbox.recordOutgoingEmail). Seedes desuden med
  // funktioner der har EKSTERN effekt (mail/SMS/e-conomic) — en action der sender mail uden gate er lige saa kritisk.
  const isLib = (f: string) => /[\\/]src[\\/]/.test(f)
  const writers = new Set([...EFFECT_SEEDS, ...sites.map((s) => s.fn.split(' ⇐ ')[0].split('>')[0]).filter((n) => !GENERIC_NAMES.has(n))])
  let changed = true
  while (changed) {
    changed = false
    for (const [callee, arr] of calls) {
      if (!writers.has(callee)) continue
      for (const { sf, call } of arr) {
        if (!isLib(sf.fileName)) continue
        const o = outerFn(call)
        if (!o) continue
        const nm = fnName(o)
        if (!GENERIC_NAMES.has(nm) && !writers.has(nm)) { writers.add(nm); changed = true }
      }
    }
  }
  lastWriterClosure = [...writers].sort()
  return sites
}

/** Saettes af scanWriteSites: alle bibliotek-funktioner der (transitivt) skriver til en tabel. */
export let lastWriterClosure: string[] = []

/** Roller der ifoelge app-gates maa udfoere op paa tabellen via bruger-klient. null = ingen bruger-sti (kun service-role). */
export function derivedRoles(sites: WriteSite[], table: string, op: string): { roles: string[] | null; unresolved: WriteSite[] } {
  const rel = sites.filter((s) => s.table === table && (s.op === op || (s.op === 'upsert' && (op === 'insert' || op === 'update'))) && s.client !== 'admin')
  const unresolved = rel.filter((s) => s.client === 'param' || s.client === 'unknown' || (s.perms.length === 0 && !s.adminOnlyGate))
  if (rel.length === 0) return { roles: null, unresolved }
  const roles = new Set<string>()
  for (const s of rel) {
    if (s.adminOnlyGate && s.perms.length === 0) roles.add('admin')
    for (const p of s.perms) for (const r of ((PERMISSIONS as Record<string, readonly string[]>)[p] ?? [])) roles.add(r)
  }
  return { roles: [...roles].sort(), unresolved }
}

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const tables = args.length ? args : WAVE1
  const sites = scanWriteSites(undefined, tables)
  if (process.argv.includes('--json')) { console.log(JSON.stringify(sites, null, 2)); process.exit(0) }
  for (const t of tables) {
    console.log(`\n=== ${t} ===`)
    for (const s of sites.filter((x) => x.table === t)) console.log(`  ${s.op.padEnd(7)} ${s.client.padEnd(8)} ${`${s.file}:${s.line} ${s.fn}`.padEnd(92)} ${s.perms.join(',') || (s.adminOnlyGate ? '(admin-gate)' : '-')}${s.client === 'unknown' || s.client === 'param' ? `  [${s.clientExpr}]` : ''}`)
    for (const op of ['insert', 'update', 'delete']) {
      const d = derivedRoles(sites, t, op)
      console.log(`  → ${op.padEnd(6)} roller: ${d.roles ? d.roles.join(',') || '(ingen perms fundet)' : 'kun service-role'}${d.unresolved.length ? `  · UAFKLAREDE: ${d.unresolved.map((u) => `${u.fn}(${u.client})`).join(', ')}` : ''}`)
    }
  }
}
