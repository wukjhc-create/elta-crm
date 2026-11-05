/**
 * Forfaldne opgaver med samme definition og afgrænsning som opgavesiden og getTaskCounts:
 * ikke færdig, har en forfaldsdato, forfaldsdatoen er passeret, og taskListScope (effektive rettigheder).
 * null = brugeren har ingen opgaveliste. Bevidst IKKE 'use server'.
 */
import { scopeTaskQuery } from '@/lib/tasks/task-scope'

export function overdueTaskFilter<T>(
  query: T,
  ctx: { userId: string | null; hasPermission: (p: never) => boolean },
  now: Date,
): T | null {
  const q = query as unknown as { neq: (c: string, v: string) => { not: (c: string, o: string, v: null) => { lt: (c: string, v: string) => unknown } } }
  return scopeTaskQuery(q.neq('status', 'done').not('due_date', 'is', null).lt('due_date', now.toISOString()) as T, ctx)
}
