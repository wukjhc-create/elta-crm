/**
 * Single audit-log surface used by every Phase 9 module. Wrapped so a
 * logging failure never crashes the suggestion flow.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiSuggestionType } from '@/types/ai-insights.types'

export async function logAiSuggestion(input: {
  type: AiSuggestionType
  message: string
  entityType?: string | null
  entityId?: string | null
  confidence?: number | null
  payload?: Record<string, unknown> | null
}): Promise<string | null> {
  console.log('AI SUGGESTION:', input.type, input.message)
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('ai_suggestions')
      .insert({
        type: input.type,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        confidence: input.confidence ?? null,
        message: input.message.slice(0, 2000),
        payload: input.payload ?? null,
      })
      .select('id')
      .maybeSingle()
    return data?.id ?? null
  } catch {
    return null
  }
}
