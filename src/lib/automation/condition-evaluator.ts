/**
 * Tiny safe condition DSL.
 *
 * condition_json shape: { [field]: { op, value } } — implicit AND across
 * all fields. Field path supports dot notation for nested payloads.
 *
 * Supported ops: eq, neq, gt, gte, lt, lte, in (value=array), contains
 *               (value=substring or array element).
 *
 * Empty / null condition object → always true.
 */
import type { ConditionExpr, ConditionOp } from '@/types/automation.types'

export function evaluateCondition(
  condition: Record<string, ConditionExpr> | null | undefined,
  payload: Record<string, unknown>
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true

  for (const [path, expr] of Object.entries(condition)) {
    const actual = readPath(payload, path)
    if (!checkOp(actual, expr.op, expr.value)) return false
  }
  return true
}

function readPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return cur
}

function checkOp(actual: unknown, op: ConditionOp, expected: unknown): boolean {
  switch (op) {
    case 'eq':  return actual === expected
    case 'neq': return actual !== expected
    case 'gt':  return Number(actual) >  Number(expected)
    case 'gte': return Number(actual) >= Number(expected)
    case 'lt':  return Number(actual) <  Number(expected)
    case 'lte': return Number(actual) <= Number(expected)
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never)
    case 'contains':
      if (typeof actual === 'string') return actual.includes(String(expected))
      if (Array.isArray(actual))      return actual.includes(expected as never)
      return false
    default: return false
  }
}
