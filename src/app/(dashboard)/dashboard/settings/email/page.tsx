import { Metadata } from 'next'
import { EmailSettingsClient } from './email-settings-client'
import { getSmtpSettings, getCompanySettings } from '@/lib/actions/settings'
import { getEmailTemplates } from '@/lib/actions/email'

export const metadata: Metadata = {
  title: 'E-mail indstillinger',
  description: 'Konfigurer SMTP og e-mail skabeloner',
}

export const dynamic = 'force-dynamic'

export default async function EmailSettingsPage() {
  const [smtpResult, companyResult, templates] = await Promise.all([
    getSmtpSettings(),
    getCompanySettings(),
    getEmailTemplates({ active_only: false }),
  ])

  const smtpSettings = smtpResult.success ? (smtpResult.data ?? null) : null
  const companySettings = companyResult.success ? (companyResult.data ?? null) : null

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">E-mail indstillinger</h1>
        <p className="text-muted-foreground">
          Konfigurer SMTP server og administrer e-mail skabeloner
        </p>
      </div>

      <EmailSettingsClient
        initialSmtpSettings={smtpSettings}
        initialCompanySettings={companySettings}
        initialTemplates={templates}
      />
    </div>
  )
}
