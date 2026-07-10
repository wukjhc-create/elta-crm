'use server'

/**
 * Offentlig glemt-adgangskode-selvbetjening.
 *
 * Sender nulstil-linket via VORES egen Microsoft Graph-postkasse (ikke Supabase
 * Auth-mail), med samme mønster som employee-login.ts (buildSetPasswordLink +
 * sendEmailViaGraph).
 *
 * SIKKERHED (offentligt, uautentificeret endpoint):
 *  - Enumeration-sikker: returnerer ALTID { success: true }, uanset om kontoen
 *    findes eller om mail lykkes. Fejl logges kun server-side.
 *  - Cooldown UDEN migration: aflæser sidste udstedelse via auth-admin
 *    (app_metadata.last_recovery_email_at — autoritativ, sat af os; recovery_
 *    sent_at som sekundært signal) og afviser STILLE hvis < 60s siden. Beskytter
 *    rigtige indbakker mod spam fra vores domæne fra dag ét.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { buildSetPasswordLink } from '@/lib/auth/set-password-link'
import { sendEmailViaGraph, isGraphConfigured } from '@/lib/services/microsoft-graph'
import { logger } from '@/lib/utils/logger'

const RECOVERY_COOLDOWN_MS = 60_000

export async function requestPasswordReset(email: string): Promise<{ success: true }> {
  // Fast generisk svar — afslører ALDRIG om kontoen findes / mail-status.
  const generic = { success: true } as const

  try {
    const target = (email || '').trim().toLowerCase()
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return generic

    const admin = createAdminClient()

    // auth-admin har ingen getUserByEmail → listUsers + find. Lille team-ERP:
    // acceptabelt. (Skalering + evt. per-IP rate-limit: se opfølgning.)
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) {
      logger.error('requestPasswordReset: listUsers fejlede', { error: listErr })
      return generic
    }
    const user = (list?.users || []).find((u) => (u.email || '').toLowerCase() === target)
    if (!user) return generic // ingen konto → intet sendt, stadig generisk success

    // Cooldown (migration-fri): autoritativ = app_metadata.last_recovery_email_at
    // (sat af os efter vellykket send); recovery_sent_at som sekundært signal.
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>
    const lastCustom =
      typeof meta.last_recovery_email_at === 'string' ? Date.parse(meta.last_recovery_email_at) : 0
    const lastRecovery = user.recovery_sent_at ? Date.parse(user.recovery_sent_at) : 0
    const lastMs = Math.max(Number.isFinite(lastCustom) ? lastCustom : 0, Number.isFinite(lastRecovery) ? lastRecovery : 0)
    if (lastMs && Date.now() - lastMs < RECOVERY_COOLDOWN_MS) {
      logger.info('requestPasswordReset: cooldown aktiv, springer over', { entityId: user.id })
      return generic // stille afvisning — udadtil ens med et succesfuldt kald
    }

    if (!isGraphConfigured()) {
      logger.error('requestPasswordReset: Microsoft Graph er ikke konfigureret')
      return generic
    }

    const { link, error: linkErr } = await buildSetPasswordLink(admin, target)
    if (!link) {
      logger.error('requestPasswordReset: kunne ikke generere link', { error: linkErr, entityId: user.id })
      return generic
    }

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
        <h2 style="font-size:18px;margin:0 0 12px">Nulstil din adgangskode</h2>
        <p style="color:#374151">Der er anmodet om nulstilling af din adgangskode til ELTA Drift. Klik på knappen for at sætte en ny adgangskode.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#166534;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Sæt ny adgangskode</a>
        </p>
        <p style="color:#6b7280;font-size:13px">Linket er personligt og udløber efter kort tid. Har du ikke anmodet om dette, kan du roligt ignorere denne mail.</p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all">${link}</p>
      </div>`

    const res = await sendEmailViaGraph({
      to: target,
      subject: 'Nulstil din adgangskode til ELTA Drift',
      html,
    })
    if (!res.success) {
      logger.error('requestPasswordReset: mail-afsendelse fejlede', { error: res.error, entityId: user.id })
      return generic
    }

    // Stamp cooldown-markør — KUN ved vellykket send (så en fejlet mail ikke
    // spærrer et gyldigt genforsøg). Bevar øvrige app_metadata-nøgler.
    const { error: stampErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, last_recovery_email_at: new Date().toISOString() },
    })
    if (stampErr) logger.error('requestPasswordReset: kunne ikke stemple cooldown', { error: stampErr, entityId: user.id })

    return generic
  } catch (e) {
    logger.error('requestPasswordReset: uventet fejl', { error: e })
    return generic
  }
}
