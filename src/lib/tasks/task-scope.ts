/**
 * TK-6 (review 2026-10-17): ÉN rolle-afgrænsning af kundeopgaver for lister/tællere (samme som getTaskCounts/getAllTasks):
 *  afgrænsningen afgøres af taskListScope (effektive rettigheder)
 * null = ingen adgang (ingen bruger). Bevidst IKKE 'use server'.
 */
export type TaskListScope = 'assigned' | 'own' | 'all'

/**
 * W-8 (2026-10-29): opgavelistens afgrænsning følger EFFEKTIVE rettigheder (ingen rå rolle-tjek) — samme nøgle som
 * RLS (O2, 00242: customers.view.all ser alle opgaver):
 *  - uden customers.view.all (montør/Elektriker): kun opgaver tildelt én selv
 *  - uden tasks.view (salg/bogholderi): egne oprettede eller tildelte
 *  - ellers: alle
 * Standardrollerne får præcis samme liste som før; en montør med Overmontør-skabelonen (customers.view.all) følger RLS.
 */
export function taskListScope(has: (p: never) => boolean): TaskListScope {
  if (!has('customers.view.all' as never)) return 'assigned'
  if (!has('tasks.view' as never)) return 'own'
  return 'all'
}

export function scopeTaskQuery<T>(
  query: T,
  ctx: { userId: string | null; hasPermission: (p: never) => boolean },
): T | null {
  // Supabase-builderens typer er for dybe til en generisk constraint — filtrene er eq/or på samme builder
  const q = query as unknown as { eq: (c: string, v: string) => unknown; or: (f: string) => unknown }
  const scope = taskListScope(ctx.hasPermission)
  if (scope === 'assigned') return ctx.userId ? (q.eq('assigned_to', ctx.userId) as T) : null
  if (scope === 'own') return ctx.userId ? (q.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`) as T) : null
  return query
}
