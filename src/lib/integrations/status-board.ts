/**
 * Driftstatus for integrationer. Viser kun til/fra — aldrig hemmeligheder.
 * ERROR bruges kun, når kalderen selv har konstateret en fejl. Her gættes den ikke.
 */
import { economicPushEnabled } from '@/lib/accounting/economic-push-flag'
import { isLiveSendEnabled } from '@/lib/agents/live-gates'
import { relatelEnabled, relatelLiveCallEnabled, relatelSmsEnabled } from '@/lib/integrations/telephony/flags'
import { automationRulesLive, followUpRemindersPaused, invoiceRemindersLive } from '@/lib/reminders/reminder-switches'

export type IntegrationMode = 'off' | 'test' | 'active' | 'error'

export interface IntegrationRow {
  id: string
  label: string
  mode: IntegrationMode
  killSwitch: string
  detail: string
}

const on = (env: Record<string, string | undefined>, key: string) => (env[key] ?? '').trim().toLowerCase() === 'true'

export function integrationBoard(
  env: Record<string, string | undefined>,
  opts?: { graphConfigured?: boolean; probeError?: string | null },
): IntegrationRow[] {
  const rows: IntegrationRow[] = [
    { id: 'mail', label: 'Mail (Microsoft Graph)', mode: opts?.graphConfigured ? 'active' : 'off', killSwitch: 'Fjern Graph-oplysningerne for at stoppe synk.', detail: opts?.graphConfigured ? 'Forbindelsen er sat. Værdierne vises ikke.' : 'Graph er ikke sat.' },
    { id: 'relatel', label: 'Relatel', mode: relatelEnabled(env) ? 'test' : 'off', killSwitch: 'RELATEL_ENABLED', detail: relatelEnabled(env) ? 'Flaget er tændt, men der er ingen live-klient og ingen gemte hændelser før migration.' : 'Slået fra. Ingen opkald, SMS eller webhook-registrering.' },
    { id: 'relatel-call', label: 'Click-to-call', mode: relatelLiveCallEnabled(env) ? 'test' : 'off', killSwitch: 'RELATEL_LIVE_CALL_ENABLED', detail: 'Selv med flaget tændt starter systemet ikke et opkald.' },
    { id: 'relatel-sms', label: 'SMS via Relatel', mode: relatelSmsEnabled(env) ? 'test' : 'off', killSwitch: 'RELATEL_SMS_ENABLED', detail: 'Selv med flaget tændt sendes ingen SMS.' },
    { id: 'economic', label: 'e-conomic skrivning', mode: economicPushEnabled(env) ? 'active' : 'off', killSwitch: 'ECONOMIC_PUSH_ENABLED', detail: economicPushEnabled(env) ? 'Skrivning er slået til.' : 'Intet skrives til e-conomic.' },
    { id: 'agent-send', label: 'Agent-afsendelse', mode: isLiveSendEnabled(env) ? 'active' : 'off', killSwitch: 'AGENT_LIVE_SEND_ENABLED', detail: isLiveSendEnabled(env) ? 'Agenter kan sende efter deres egen godkendelse.' : 'Agenter sender ikke.' },
    { id: 'automation', label: 'Automatiseringsregler', mode: automationRulesLive(env) ? 'active' : 'off', killSwitch: 'AUTOMATION_RULES_LIVE', detail: automationRulesLive(env) ? 'Reglerne kører live.' : 'Reglerne er dry-run.' },
    { id: 'telegram', label: 'Telegram-assistent', mode: on(env, 'ASSISTANT_TELEGRAM_ENABLED') ? 'active' : 'off', killSwitch: 'ASSISTANT_TELEGRAM_ENABLED', detail: 'CRM-assistenten på /dashboard/assistant bruger ikke Telegram.' },
    { id: 'invoice-reminders', label: 'Faktura-rykkere', mode: invoiceRemindersLive(env) ? 'active' : 'off', killSwitch: 'INVOICE_REMINDERS_LIVE', detail: 'Eksisterende rykker-cron. Denne oversigt ændrer den ikke.' },
    { id: 'offer-reminders', label: 'Tilbudsrykkere', mode: on(env, 'OFFER_REMINDERS_LIVE') ? 'active' : 'off', killSwitch: 'OFFER_REMINDERS_LIVE', detail: 'Eksisterende tilbudsrykker. Denne oversigt ændrer den ikke.' },
    { id: 'followup-existing', label: 'Fuldmagt- og besigtigelsesrykkere', mode: followUpRemindersPaused(env) ? 'off' : 'active', killSwitch: 'FOLLOWUP_REMINDERS_PAUSED', detail: 'Eksisterende cron. Pause slår den fra. Nye forslag sender ikke.' },
    { id: 'comm-preview', label: 'Nye kommunikationsforslag', mode: 'test', killSwitch: 'Ingen afsendelse i forhåndsvisningen', detail: 'Dry-run. wouldSend er altid false.' },
    { id: 'klarpris', label: 'KlarPris', mode: 'off', killSwitch: 'Ingen API-nøgle er koblet på', detail: 'Sammenligning bruger det gemte grossistkatalog. Der afgives ingen ordre.' },
    { id: 'supplier-orders', label: 'Leverandørordrer', mode: 'off', killSwitch: 'Ingen bestillingsklient', detail: 'AO, Solar og Lemvigh-Müller bruges som katalog. Der bestilles ikke.' },
  ]
  if (opts?.probeError) rows.push({ id: 'probe', label: 'Forbindelsestest', mode: 'error', killSwitch: 'Ret fejlen før noget sættes aktivt', detail: opts.probeError })
  return rows
}
