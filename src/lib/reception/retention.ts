/**
 * Fase 3A — Henvendelser-retention. Server-only: bevidst IKKE 'use server' og aldrig i klientkode.
 *
 * SKEL: de KANONISKE kilder (incoming_emails, portal_messages, telephony_calls, web_chat_*) følger deres egen retention
 * og røres ALDRIG herfra. Henvendelser beholder kun det, routing kræver: kildereference, status, tider, audit og
 * kunde/sag. KOPIERET tekst (uddrag, afsendernavn, emne/titel, AI-resumé, vedhæftningsnavne, transskriptions-reference)
 * kan ryddes efter politikken nedenfor — af databasefunktionen reception_retention (kun service_role, auditeret).
 *
 * Standard er DRY-RUN (kun antal). Anvendelse kræver RECEPTION_RETENTION_APPLY=true OG et eksplicit kald — ingen cron i
 * vercel.json (planlægning kræver Henriks godkendelse). Åbne henvendelser ryddes aldrig (undtagen slettet kunde/kilde).
 */
import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/security/safe-equal'

export interface RetentionPolicy {
  /** Afsluttede henvendelser: items' kopierede tekst ryddes efter N dage (7..3650) */
  handled_text_days: number
  /** Afsluttede henvendelser: AI-resumé + titel ryddes efter N dage (7..3650) */
  handled_summary_days: number
  /** Kunden slettet: kopieret tekst ryddes efter N dage (0..365) */
  customer_deleted_days: number
  /** Kilden slettet (fx mail slettet efter mail-retention): itemets kopierede tekst ryddes efter N dage (0..365) */
  orphan_source_days: number
}

/** Forslag til første politik (skal godkendes af Henrik før anvendelse i prod) */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = { handled_text_days: 90, handled_summary_days: 180, customer_deleted_days: 0, orphan_source_days: 0 }

export function clampPolicy(p: Partial<RetentionPolicy>): RetentionPolicy {
  const c = (v: unknown, def: number, lo: number, hi: number) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v as number)) : def)
  return {
    handled_text_days: c(p.handled_text_days, DEFAULT_RETENTION_POLICY.handled_text_days, 7, 3650),
    handled_summary_days: c(p.handled_summary_days, DEFAULT_RETENTION_POLICY.handled_summary_days, 7, 3650),
    customer_deleted_days: c(p.customer_deleted_days, DEFAULT_RETENTION_POLICY.customer_deleted_days, 0, 365),
    orphan_source_days: c(p.orphan_source_days, DEFAULT_RETENTION_POLICY.orphan_source_days, 0, 365),
  }
}

export const retentionApplyEnabled = (env: Record<string, string | undefined> = process.env) => (env.RECEPTION_RETENTION_APPLY ?? '').trim().toLowerCase() === 'true'

/** Kør (dry-run medmindre apply OG flaget). rpc-porten er KUN reception_retention. */
export async function runReceptionRetention(
  rpc: (fn: 'reception_retention', args: { p_policy: RetentionPolicy; p_apply: boolean }) => PromiseLike<{ data: unknown; error: { code?: string | null } | null }>,
  opts: { apply: boolean; policy?: Partial<RetentionPolicy>; env?: Record<string, string | undefined> },
): Promise<{ ok: true; applied: boolean; result: Record<string, unknown> } | { ok: false; error: 'unavailable' | 'failed' }> {
  const apply = opts.apply && retentionApplyEnabled(opts.env)
  const { data, error } = await rpc('reception_retention', { p_policy: clampPolicy(opts.policy ?? {}), p_apply: apply })
  if (error) return { ok: false, error: ['PGRST202', '42883', '42P01', 'PGRST205'].includes(String(error.code)) ? 'unavailable' : 'failed' }
  return { ok: true, applied: apply, result: (data ?? {}) as Record<string, unknown> }
}

/** Cron-handler (IKKE planlagt). Bearer CRON_SECRET. ?apply=1 kræver også RECEPTION_RETENTION_APPLY=true. */
export async function handleReceptionRetention(request: Request, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const secret = env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || !auth || !auth.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = auth.slice('Bearer '.length)
  if (token.length !== secret.length || !safeEqual(token, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const wantApply = new URL(request.url).searchParams.get('apply') === '1'
  const r = await runReceptionRetention((fn, args) => admin.rpc(fn, args), { apply: wantApply, env })
  if (!r.ok) return NextResponse.json({ success: r.error === 'unavailable', skipped: r.error === 'unavailable' }, { status: r.error === 'unavailable' ? 200 : 500 })
  return NextResponse.json({ success: true, applied: r.applied, counts: r.result })
}
