/**
 * UI-tilstands-audit (P1 #8) — statisk, ingen DB.
 *
 *   G1  Hver side under et menupunkt med permission/adminOnly har en SERVER-side guard (side eller layout paa vejen),
 *       saa direkte URL-adgang giver "Du har ikke adgang" og ikke en misvisende tom liste / raa fejl.
 *   G2  Hvert topniveau-modul under /dashboard er daekket af en error-boundary (egen eller /dashboard/error.tsx).
 *   G3  Root har global-error.tsx (fejl i root-layout) og not-found.tsx.
 *   G4  Ingen blindgyde: enhver rolle der SER et menupunkt, slipper ogsaa igennem modulets layout-guard.
 *
 * Koer: npx tsx scripts/ui-guard-audit.ts   (exit 2 ved fund)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { PERMISSIONS } from '../src/lib/auth/permissions'

const ROOT = process.cwd()
const APP = join(ROOT, 'src', 'app')
/** Bevidst aabne sider under et gatet menupunkt (personlige indstillinger; hubben filtrerer selv sine kort). */
const OPEN_BY_DESIGN = new Set([
  'src/app/dashboard/settings/profile/page.tsx',
  'src/app/dashboard/settings/security/page.tsx',
  'src/app/dashboard/settings/notifications/page.tsx', // redirecter til hubben
])
const GUARD_RE = /ModuleGuard|pageHasPermission|getPageRoleContext|requirePagePermission|requireAdminPage|<NoAccess|isAdmin\(|role\s*[!=]==\s*['"]admin['"]/

interface NavItem { href: string; gate: string }

function navItems(): NavItem[] {
  const src = readFileSync(join(ROOT, 'src', 'components', 'layout', 'sidebar.tsx'), 'utf8')
  const out: NavItem[] = []
  const re = /href:\s*'([^']+)'([\s\S]*?)(?=href:|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const body = m[2].slice(0, 400)
    const perm = /permission:\s*'([^']+)'/.exec(body)?.[1]
    const admin = /adminOnly:\s*true/.test(body)
    if (perm || admin) out.push({ href: m[1], gate: perm ?? 'adminOnly' })
  }
  return out
}

function pagesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const res: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) res.push(...pagesUnder(p))
    else if (e === 'page.tsx') res.push(p)
  }
  return res
}

/** Guard i siden selv, eller i en layout.tsx mellem siden og modul-roden. */
function isGuarded(page: string, moduleRoot: string): boolean {
  if (GUARD_RE.test(readFileSync(page, 'utf8'))) return true
  let d = join(page, '..')
  while (d.length >= moduleRoot.length) {
    const lay = join(d, 'layout.tsx')
    if (existsSync(lay) && GUARD_RE.test(readFileSync(lay, 'utf8'))) return true
    if (d === moduleRoot) break
    d = join(d, '..')
  }
  return false
}

export function runUiGuardAudit(): { findings: string[]; checked: number } {
  const findings: string[] = []
  let checked = 0
  const seen = new Set<string>()
  for (const item of navItems()) {
    if (item.href === '/dashboard') continue
    const moduleRoot = join(APP, ...item.href.split('/').filter(Boolean))
    for (const page of pagesUnder(moduleRoot)) {
      if (seen.has(page) || OPEN_BY_DESIGN.has(relative(ROOT, page).split(sep).join('/'))) continue
      seen.add(page)
      checked++
      if (!isGuarded(page, moduleRoot)) findings.push(`G1 ${relative(ROOT, page).split(sep).join('/')} (menu-gate: ${item.gate}) har ingen server-guard`)
    }
  }
  // G4
  const rolesFor = (gate: string): string[] => gate === 'adminOnly' ? ['admin'] : [...((PERMISSIONS as Record<string, readonly string[]>)[gate] ?? [])]
  for (const item of navItems()) {
    const lay = join(APP, ...item.href.split('/').filter(Boolean), 'layout.tsx')
    if (!existsSync(lay)) continue
    const src = readFileSync(lay, 'utf8')
    const guard = /<ModuleGuard\s+adminOnly/.test(src) ? 'adminOnly' : /<ModuleGuard\s+permission="([^"]+)"/.exec(src)?.[1]
    if (!guard) continue
    const blocked = rolesFor(item.gate).filter((r) => !rolesFor(guard).includes(r))
    if (blocked.length) findings.push(`G4 ${item.href}: menu (${item.gate}) vises for ${blocked.join(', ')}, men layout-guard (${guard}) afviser dem`)
  }
  const dash = join(APP, 'dashboard')
  if (!existsSync(join(dash, 'error.tsx'))) findings.push('G2 src/app/dashboard/error.tsx mangler')
  if (!existsSync(join(APP, 'global-error.tsx'))) findings.push('G3 src/app/global-error.tsx mangler (fejl i root-layout giver hvid side)')
  if (!existsSync(join(APP, 'not-found.tsx'))) findings.push('G3 src/app/not-found.tsx mangler')
  return { findings, checked }
}

if (process.argv[1] && /ui-guard-audit/.test(process.argv[1])) {
  const { findings, checked } = runUiGuardAudit()
  console.log(`UI-GUARD-AUDIT: ${checked} menu-gatede sider kontrolleret`)
  for (const f of findings) console.log(`  ❌ ${f}`)
  console.log(findings.length ? `  ❌ ${findings.length} fund` : '  ✅ alle sider har server-guard; error-boundaries daekker')
  process.exitCode = findings.length ? 2 : 0
}
