/**
 * TK-6 (review 2026-10-17): ÉN rolle-afgrænsning af kundeopgaver for lister/tællere (samme som getTaskCounts/getAllTasks):
 *  - montør: kun tildelt sig selv
 *  - uden tasks.view (salg/bogholderi, W-8): egne oprettede eller tildelte
 *  - ellers: alle
 * null = ingen adgang (ingen bruger). Bevidst IKKE 'use server'.
 */
export function scopeTaskQuery<T>(
  query: T,
  ctx: { role: string; userId: string | null; hasPermission: (p: never) => boolean },
): T | null {
  // Supabase-builderens typer er for dybe til en generisk constraint — filtrene er eq/or på samme builder
  const q = query as unknown as { eq: (c: string, v: string) => unknown; or: (f: string) => unknown }
  if (ctx.role === 'montør') return ctx.userId ? (q.eq('assigned_to', ctx.userId) as T) : null
  if (!ctx.hasPermission('tasks.view' as never)) return ctx.userId ? (q.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`) as T) : null
  return query
}
