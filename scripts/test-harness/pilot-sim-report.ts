/**
 * PILOT-SIM scorecard-målinger: samler %TEMP%/elta-ui-e2e/pilot-sim-*.jsonl (skrevet af pilot-sim.ts).
 *   npx tsx scripts/test-harness/pilot-sim-report.ts            # filer fra de seneste 12 timer
 *   npx tsx scripts/test-harness/pilot-sim-report.ts --hours 48
 * Flag (Henrik 2026-10-31): side > 3 s gentagne gange · server-action > 2 s gentagne gange · dublet-kald · vandret scroll
 * på mobil. Første besøg pr. sti pr. proces (kold) tælles ikke med i flag — enkeltstående kolde udsving optimeres ikke.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const hoursArg = process.argv.indexOf('--hours')
const hours = hoursArg > -1 ? Number(process.argv[hoursArg + 1]) : 12
const dir = join(tmpdir(), 'elta-ui-e2e')
const files = readdirSync(dir).filter((f) => /^pilot-sim-\d+\.jsonl$/.test(f)).filter((f) => Date.now() - statSync(join(dir, f)).mtimeMs < hours * 3600_000)
type Rec = { kind: string; slot: number; role?: string; wf?: string; path?: string; action?: string; ms?: number; failed?: boolean; status?: number | null; scrollWidth?: number | null; variant?: string; worker?: string; seconds?: number; aborted?: string; office?: Record<string, boolean>; mobile?: Record<string, boolean>; economy?: Record<string, boolean> }
const recs: Array<Rec & { file: string }> = []
for (const f of files) for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) { if (line.trim()) try { recs.push({ ...JSON.parse(line), file: f }) } catch { /* halv linje */ } }

const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
console.log(`=== PILOT-SIM målinger — ${files.length} kørsel(er), ${recs.length} målepunkter ===`)

// workflows
const wfs = recs.filter((r) => r.kind === 'workflow')
const stageOk = (o?: Record<string, boolean>) => !!o && Object.keys(o).length > 0 && Object.values(o).every(Boolean)
console.log(`\nWorkflows: ${wfs.length} · fuldt bestået ${wfs.filter((w) => !w.aborted && stageOk(w.office) && stageOk(w.mobile) && stageOk(w.economy)).length} · afbrudt ${wfs.filter((w) => w.aborted).length}`)
console.log(`  median varighed ${pct(wfs.map((w) => w.seconds ?? 0), 0.5)} s · max ${Math.max(0, ...wfs.map((w) => w.seconds ?? 0))} s`)
const failedKeys = new Map<string, string[]>()
for (const w of wfs) for (const o of [w.office, w.mobile, w.economy]) for (const [k, v] of Object.entries(o ?? {})) if (!v) failedKeys.set(k, [...(failedKeys.get(k) ?? []), `${w.wf}(${w.variant})`])
if (failedKeys.size) { console.log('  fejlede tjek:'); for (const [k, v] of failedKeys) console.log(`    ${k.padEnd(44)} ${v.length}× ${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}`) }

// sider
const pages = recs.filter((r) => r.kind === 'page')
const seen = new Set<string>()
const warm = pages.filter((p) => { const k = `${p.file}|${p.path}`; if (seen.has(k)) return true; seen.add(k); return false })
const byPath = new Map<string, number[]>()
for (const p of warm) byPath.set(p.path!, [...(byPath.get(p.path!) ?? []), p.ms!])
console.log(`\nSider (varme besøg, ${warm.length} af ${pages.length}):`)
const pageRows = [...byPath].map(([path, xs]) => ({ path, n: xs.length, median: pct(xs, 0.5), p90: pct(xs, 0.9), max: Math.max(...xs), over3s: xs.filter((x) => x > 3000).length })).sort((a, b) => b.p90 - a.p90)
console.table(pageRows.slice(0, 20))
const slowPages = pageRows.filter((r) => r.over3s >= 2)
console.log(slowPages.length ? `⚠ side > 3 s gentagne gange: ${slowPages.map((r) => `${r.path} (${r.over3s}/${r.n})`).join(', ')}` : '✓ ingen side > 3 s gentagne gange')

// server-actions
const acts = recs.filter((r) => r.kind === 'action')
const byAct = new Map<string, number[]>()
for (const a of acts) byAct.set(`${a.path} ${a.action}`, [...(byAct.get(`${a.path} ${a.action}`) ?? []), a.ms!])
const actRows = [...byAct].map(([k, xs]) => ({ action: k, n: xs.length, median: pct(xs, 0.5), max: Math.max(...xs), over2s: xs.filter((x) => x > 2000).length })).sort((a, b) => b.over2s - a.over2s || b.median - a.median)
console.log(`\nServer-actions (${acts.length} kald, ${acts.filter((a) => a.failed).length} afbrudt/fejlet på netværk):`)
console.table(actRows.slice(0, 15))
const slowActs = actRows.filter((r) => r.over2s >= 2)
console.log(slowActs.length ? `⚠ action > 2 s gentagne gange: ${slowActs.map((r) => `${r.action} (${r.over2s}/${r.n})`).join(', ')}` : '✓ ingen server-action > 2 s gentagne gange')
// kald pr. sidebesøg (N+1-indikator): mange actions på samme sti inden for samme workflow
const perVisit = new Map<string, number>()
for (const a of acts) perVisit.set(`${a.wf}|${a.role}|${a.path}`, (perVisit.get(`${a.wf}|${a.role}|${a.path}`) ?? 0) + 1)
const heavy = [...perVisit].filter(([, n]) => n >= 15).map(([k, n]) => `${k.split('|').slice(1).join(' ')}: ${n}`)
console.log(heavy.length ? `⚠ mange action-kald på én side i ét workflow (N+1?): ${[...new Set(heavy)].slice(0, 8).join(' · ')}` : '✓ ingen side med ≥15 action-kald i ét workflow')

// dubletter
const dups = recs.filter((r) => r.kind === 'dup_action')
const dupBy = new Map<string, number>()
for (const x of dups) dupBy.set(`${x.role} ${x.path} ${x.action}`, (dupBy.get(`${x.role} ${x.path} ${x.action}`) ?? 0) + 1)
console.log(dups.length ? `\n⚠ identiske action-kald inden for 1,5 s: ${[...dupBy].map(([k, n]) => `${k} ×${n}`).join(' · ')}` : '\n✓ ingen identiske dublet-kald')

// mobil
const mob = pages.filter((p) => p.scrollWidth != null)
// viewport pr. rolle i pilot-sim: montør/elektriker 375 px, kunden (portal) 390 px
const over = mob.filter((p) => (p.scrollWidth ?? 0) > (p.role === 'kunde' ? 391 : 376))
console.log(over.length ? `⚠ vandret scroll på mobil: ${[...new Set(over.map((p) => `${p.path} (${p.scrollWidth}px)`))].join(', ')}` : `✓ ingen vandret scroll på ${mob.length} mobilsider`)
