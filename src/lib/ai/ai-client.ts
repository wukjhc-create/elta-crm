/**
 * KANONISK server-side AI-klient (AI-receptionist fase 2). Bevidst IKKE 'use server' og må aldrig importeres i
 * klientkode (håndhævet af scripts/assert-server-only-helpers.ts) — API-nøglen forlader aldrig serveren.
 *
 *  - Model-konfiguration ét sted (AI_TASKS) — skift model/leverandør her, ikke i kalderne.
 *  - Leverandør bag `AiProvider` (OpenAI i dag); tests injicerer en fake via `deps.provider`.
 *  - Struktureret resultat: { ok: true, data } | { ok: false, error: { code, retryable, status? } }.
 *    En leverandørfejl er ALDRIG et tomt resultat. Fejlkoder er audit-sikre (ingen nøgler, ingen rå svartekst).
 *  - Central timeout, dagligt AI-budget (ai-budget.ts), skema-validering af JSON-svar.
 */
import { logger } from '@/lib/utils/logger'

export type AiTask = 'mail_assistant' | 'reception_classify' | 'reception_webchat_reply'

interface TaskConfig { model: string; temperature: number; maxTokens: number; timeoutMs: number; json: boolean }

/** Model-konfiguration — eneste sted modelnavne står for de migrerede kaldere */
export const AI_TASKS: Record<AiTask, TaskConfig> = {
  mail_assistant: { model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 600, timeoutMs: 12_000, json: false },
  reception_classify: { model: 'gpt-4o-mini', temperature: 0, maxTokens: 300, timeoutMs: 8_000, json: true },
  // Fase 3A web-chat (STAGING): må kun omformulere et deterministisk svar ud fra vidensbasen; efterkontrolleres
  reception_webchat_reply: { model: 'gpt-4o-mini', temperature: 0.2, maxTokens: 300, timeoutMs: 8_000, json: true },
}

export type AiErrorCode =
  | 'not_configured' | 'budget_exhausted' | 'budget_unavailable' | 'timeout' | 'provider_http' | 'provider_network'
  | 'empty_response' | 'invalid_json' | 'schema_invalid'

export interface AiError { code: AiErrorCode; retryable: boolean; status?: number }
export type AiResult<T> = { ok: true; data: T; model: string; provider: string } | { ok: false; error: AiError }

export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ProviderRequest { model: string; temperature: number; maxTokens: number; json: boolean; messages: AiMessage[]; signal: AbortSignal }
export type ProviderResponse = { ok: true; text: string | null } | { ok: false; status: number }

export interface AiProvider {
  name: string
  configured: () => boolean
  chat: (req: ProviderRequest) => Promise<ProviderResponse>
}

export const openAiProvider: AiProvider = {
  name: 'openai',
  configured: () => !!process.env.OPENAI_API_KEY,
  chat: async (req) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: req.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model, temperature: req.temperature, max_tokens: req.maxTokens, messages: req.messages,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) { await res.text().catch(() => ''); return { ok: false, status: res.status } }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    return { ok: true, text: data.choices?.[0]?.message?.content ?? null }
  },
}

export interface AiDeps {
  provider?: AiProvider
  /** Budget-tjek; standard = ai-budget.ts (fail-closed: kan budgettet ikke læses, afvises kaldet) */
  canSpend?: () => Promise<boolean>
  record?: () => Promise<void>
}

async function defaultCanSpend(): Promise<boolean> {
  const { canSpendAi } = await import('@/lib/services/ai-budget')
  return canSpendAi()
}
async function defaultRecord(): Promise<void> {
  const { recordAiCall } = await import('@/lib/services/ai-budget')
  await recordAiCall(1)
}

/** Fritekst-svar */
export async function aiChat(task: AiTask, messages: AiMessage[], deps: AiDeps = {}): Promise<AiResult<string>> {
  const cfg = AI_TASKS[task]
  const provider = deps.provider ?? openAiProvider
  if (!provider.configured()) return { ok: false, error: { code: 'not_configured', retryable: false } }
  let allowed: boolean
  try { allowed = await (deps.canSpend ?? defaultCanSpend)() } catch { return { ok: false, error: { code: 'budget_unavailable', retryable: true } } }
  if (!allowed) return { ok: false, error: { code: 'budget_exhausted', retryable: false } }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const r = await provider.chat({ model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens, json: cfg.json, messages, signal: controller.signal })
    if (!r.ok) {
      logger.warn('ai-client: leverandørfejl', { metadata: { task, provider: provider.name, status: r.status } })
      return { ok: false, error: { code: 'provider_http', retryable: r.status === 429 || r.status >= 500, status: r.status } }
    }
    try { await (deps.record ?? defaultRecord)() } catch { /* tælling må ikke vælte et gyldigt svar */ }
    const text = r.text?.trim()
    if (!text) return { ok: false, error: { code: 'empty_response', retryable: true } }
    return { ok: true, data: text, model: cfg.model, provider: provider.name }
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    if (!aborted) logger.warn('ai-client: netværksfejl', { metadata: { task, provider: provider.name } })
    return { ok: false, error: { code: aborted ? 'timeout' : 'provider_network', retryable: true } }
  } finally {
    clearTimeout(timer)
  }
}

/** JSON-svar valideret af kalderens validator (null = ugyldigt) */
export async function aiStructured<T>(task: AiTask, messages: AiMessage[], validate: (x: unknown) => T | null, deps: AiDeps = {}): Promise<AiResult<T>> {
  const r = await aiChat(task, messages, deps)
  if (!r.ok) return r
  let parsed: unknown
  try { parsed = JSON.parse(r.data) } catch { return { ok: false, error: { code: 'invalid_json', retryable: true } } }
  const v = validate(parsed)
  if (v === null) return { ok: false, error: { code: 'schema_invalid', retryable: false } }
  return { ok: true, data: v, model: r.model, provider: r.provider }
}

/** Dansk, brugervenlig fejltekst (uden tekniske detaljer) */
export function aiErrorText(e: AiError): string {
  switch (e.code) {
    case 'not_configured': return 'AI er ikke konfigureret'
    case 'budget_exhausted': return 'AI dagligt budget er opbrugt — prøv igen i morgen'
    case 'budget_unavailable': return 'AI-budgettet kunne ikke kontrolleres — prøv igen'
    case 'timeout': return 'AI svarer ikke (timeout) — prøv igen'
    case 'provider_http': return `AI-tjeneste fejlede (${e.status ?? 'ukendt'})`
    case 'provider_network': return 'AI-tjenesten kunne ikke nås — prøv igen'
    case 'empty_response': return 'AI returnerede tomt svar'
    case 'invalid_json':
    case 'schema_invalid': return 'AI returnerede et ugyldigt svar'
  }
}
