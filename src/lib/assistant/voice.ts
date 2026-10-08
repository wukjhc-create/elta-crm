/**
 * ELTA Assistant — talebeskeder (T11, fundament). Talebesked → tekst → SAMME kommandomotor som tekst.
 *
 * Slået FRA som standard: uden ASSISTANT_VOICE_ENABLED='true' transskriberes intet (svar: "send som tekst").
 * Grænser før noget hentes: højst VOICE_MAX_SECONDS sekunder og VOICE_MAX_BYTES bytes; kun forbundne, aktive
 * brugere (tjekkes i handle-update FØR transskription — ukendte chats koster intet og gemmes ikke).
 * Lyden gemmes ALDRIG; transskriptionen gemmes ikke i audit (kun længde/varighed).
 *
 * Både fil-hentning (Telegram getFile) og transskription kan udskiftes (tests; intet live).
 * Standard-transskription: OpenAI-lydtransskription (OPENAI_API_KEY, dansk), bag det daglige AI-budget.
 */
import { canSpendAi, recordAiCall } from '@/lib/services/ai-budget'

export const VOICE_MAX_SECONDS = 60
export const VOICE_MAX_BYTES = 1_500_000

export type VoiceAudio = { bytes: Uint8Array; mimeType: string; durationSec: number }
export type TranscribeResult = { ok: true; text: string } | { ok: false; reason: 'disabled' | 'budget' | 'failed' | 'empty' }
export type VoiceTranscriber = (audio: VoiceAudio) => Promise<TranscribeResult>
export type TelegramFileFetcher = (fileId: string) => Promise<Uint8Array | null>

export function voiceEnabled(): boolean {
  return process.env.ASSISTANT_VOICE_ENABLED === 'true'
}

/** Gyldig talebesked inden for grænserne? (før download) */
export function voiceWithinLimits(v: { duration?: number; file_size?: number }): { ok: true } | { ok: false; reason: 'too_long' | 'too_large' } {
  if ((v.duration ?? 0) > VOICE_MAX_SECONDS) return { ok: false, reason: 'too_long' }
  if ((v.file_size ?? 0) > VOICE_MAX_BYTES) return { ok: false, reason: 'too_large' }
  return { ok: true }
}

const liveFetcher: TelegramFileFetcher = async (fileId) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
  if (!meta.ok) return null
  const path = ((await meta.json()) as { result?: { file_path?: string } }).result?.file_path
  if (!path) return null
  const file = await fetch(`https://api.telegram.org/file/bot${token}/${path}`)
  if (!file.ok) return null
  const buf = new Uint8Array(await file.arrayBuffer())
  return buf.byteLength > VOICE_MAX_BYTES ? null : buf
}

const liveTranscriber: VoiceTranscriber = async (audio) => {
  if (!voiceEnabled()) return { ok: false, reason: 'disabled' }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, reason: 'disabled' }
  if (!(await canSpendAi())) return { ok: false, reason: 'budget' }
  const form = new FormData()
  const ab = audio.bytes.buffer.slice(audio.bytes.byteOffset, audio.bytes.byteOffset + audio.bytes.byteLength) as ArrayBuffer
  form.append('file', new Blob([ab], { type: audio.mimeType || 'audio/ogg' }), 'voice.ogg')
  form.append('model', 'whisper-1')
  form.append('language', 'da')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null)
  await recordAiCall()
  if (!res || !res.ok) return { ok: false, reason: 'failed' }
  const text = String(((await res.json()) as { text?: string }).text ?? '').trim()
  return text ? { ok: true, text } : { ok: false, reason: 'empty' }
}

let fetcher: TelegramFileFetcher = liveFetcher
let transcriber: VoiceTranscriber = liveTranscriber

export function setVoiceAdapters(a: { fetcher?: TelegramFileFetcher | null; transcriber?: VoiceTranscriber | null }): void {
  if (a.fetcher !== undefined) fetcher = a.fetcher ?? liveFetcher
  if (a.transcriber !== undefined) transcriber = a.transcriber ?? liveTranscriber
}

/** Hent + transskribér en Telegram-talebesked. Kalderen har allerede tjekket flag, bruger og grænser. */
export async function transcribeTelegramVoice(v: { file_id: string; duration?: number; mime_type?: string }): Promise<TranscribeResult> {
  const bytes = await fetcher(v.file_id).catch(() => null)
  if (!bytes) return { ok: false, reason: 'failed' }
  const r = await transcriber({ bytes, mimeType: v.mime_type ?? 'audio/ogg', durationSec: v.duration ?? 0 }).catch(() => ({ ok: false as const, reason: 'failed' as const }))
  if (r.ok && r.text.length > 500) return { ok: true, text: r.text.slice(0, 500) }
  return r
}
