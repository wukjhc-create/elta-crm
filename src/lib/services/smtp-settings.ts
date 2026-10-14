/**
 * SMTP-indstillinger inkl. password — KUN til server-side afsendelse (fx portal-notifikation når Graph ikke er sat op).
 * Settings-review 2026-10-09: getSmtpSettings var en server action i en 'use server'-fil og returnerede passwordet i
 * klartekst til browseren. Denne helper er ikke en server action (ingen 'use server') og kan ikke kaldes fra klienten.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface SmtpSettings {
  host: string | null
  port: number | null
  user: string | null
  password: string | null
  fromEmail: string | null
  fromName: string | null
}

export async function readSmtpSettingsServerOnly(): Promise<SmtpSettings | null> {
  const { data } = await createAdminClient()
    .from('company_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name')
    .maybeSingle()
  if (!data) return null
  return {
    host: data.smtp_host, port: data.smtp_port, user: data.smtp_user, password: data.smtp_password,
    fromEmail: data.smtp_from_email, fromName: data.smtp_from_name,
  }
}
