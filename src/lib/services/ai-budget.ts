/**
 * Daily AI usage cap.
 *
 * Counts OpenAI calls per UTC day in `ai_usage_daily` and refuses
 * additional calls once the env-configurable cap is reached.
 *
 * Cap: env AI_DAILY_CAP (default 2000).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_CAP = 2000
const MAX_CAS_ATTEMPTS = 20

function getCap(): number {
  const raw = process.env.AI_DAILY_CAP
  if (!raw) return DEFAULT_CAP
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP
}

function todayUtc(): string {
  return new Date().toISOString().substring(0, 10)
}

/**
 * Returns true if there is budget remaining for at least one more call.
 * Does NOT increment — call recordAiCall() after the call completes.
 */
export async function canSpendAi(): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('ai_usage_daily')
      .select('call_count')
      .eq('day', todayUtc())
      .maybeSingle()
    const used = data?.call_count ?? 0
    const cap = getCap()
    if (used >= cap) {
      console.warn('AI BUDGET EXCEEDED', { used, cap, day: todayUtc() })
      return false
    }
    return true
  } catch (err) {
    // On read failure, fail OPEN (better to allow than to block all email processing).
    console.warn('canSpendAi check failed; allowing call', err instanceof Error ? err.message : err)
    return true
  }
}

/**
 * Increments today's counter by 1 (or `n`). Best-effort; never throws.
 */
export async function recordAiCall(n = 1): Promise<void> {
  try {
    const supabase = createAdminClient()
    const day = todayUtc()
    // Mail-review 2026-10-09 (#3): compare-and-set i stedet for læs-så-skriv — samtidige kald (sync + brugeres
    // AI-assistent) mistede før optællinger, så AI_DAILY_CAP blev et blødt loft
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      // tilfældig backoff efter et tabt kapløb, så samtidige kald ikke rammer samme værdi igen
      if (attempt > 0) await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * attempt))
      const { data: row } = await supabase
        .from('ai_usage_daily')
        .select('call_count')
        .eq('day', day)
        .maybeSingle()
      if (!row) {
        const { error } = await supabase
          .from('ai_usage_daily')
          .insert({ day, call_count: n, updated_at: new Date().toISOString() })
        if (!error) return
        continue // 23505: en anden oprettede dagens række — prøv igen som opdatering
      }
      const current = row.call_count ?? 0
      const { data: updated } = await supabase
        .from('ai_usage_daily')
        .update({ call_count: current + n, updated_at: new Date().toISOString() })
        .eq('day', day)
        .eq('call_count', current)
        .select('day')
      if (updated && updated.length > 0) return
    }
    console.warn(`recordAiCall: gav op efter ${MAX_CAS_ATTEMPTS} forsøg (konkurrerende opdateringer)`)
  } catch (err) {
    console.warn('recordAiCall failed', err instanceof Error ? err.message : err)
  }
}
