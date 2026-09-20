/**
 * Test Harness — invariant-runner + rapportformat.
 *
 * runInvariants tager en READ-ONLY query-funktion (caller-ansvar) og et
 * saet checks, koerer dem og bygger en HarnessReport. Muterer intet.
 */
import type { HarnessReport, InvariantCheck, InvariantResult, InvariantSeverity } from './types'

export type QueryFn = (sql: string) => Promise<unknown[]>

const SEVERITIES: InvariantSeverity[] = ['critical', 'high', 'medium', 'low']

export async function runInvariants(
  query: QueryFn,
  checks: InvariantCheck[],
  targetLabel: string,
): Promise<HarnessReport> {
  const startedAt = new Date().toISOString()
  const results: InvariantResult[] = []

  for (const c of checks) {
    try {
      const rows = await query(c.violationSql)
      const violations = Array.isArray(rows) ? rows.length : 0
      results.push({
        id: c.id,
        title: c.title,
        severity: c.severity,
        ok: violations === 0,
        violations,
        sample: violations > 0 ? (rows as unknown[]).slice(0, 5) : undefined,
      })
    } catch (err) {
      results.push({
        id: c.id,
        title: c.title,
        severity: c.severity,
        ok: false,
        violations: -1,
        error: err instanceof Error ? err.message : 'query-fejl',
      })
    }
  }

  const bySeverity = Object.fromEntries(
    SEVERITIES.map((s) => [s, { passed: 0, failed: 0 }]),
  ) as HarnessReport['bySeverity']
  for (const r of results) {
    bySeverity[r.severity][r.ok ? 'passed' : 'failed']++
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    target: targetLabel,
    totalChecks: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    bySeverity,
    results,
  }
}

export function formatReport(report: HarnessReport): string {
  const lines: string[] = []
  lines.push(`=== Test Harness invariant-rapport ===`)
  lines.push(`Target: ${report.target}`)
  lines.push(`Tid: ${report.startedAt} -> ${report.finishedAt}`)
  lines.push(`Checks: ${report.totalChecks} | PASS ${report.passed} | FAIL ${report.failed}`)
  lines.push(
    `Severity: ` +
      SEVERITIES.map((s) => `${s}(${report.bySeverity[s].failed} fail)`).join(' · '),
  )
  lines.push('')
  for (const r of report.results) {
    const status = r.violations === -1 ? 'ERROR' : r.ok ? 'PASS ' : 'FAIL '
    lines.push(`${status} [${r.severity}] ${r.id}: ${r.title}` + (r.ok ? '' : ` — ${r.violations} violation(s)`))
    if (r.error) lines.push(`        error: ${r.error}`)
    if (r.sample?.length) lines.push(`        sample: ${JSON.stringify(r.sample).slice(0, 300)}`)
  }
  return lines.join('\n')
}
