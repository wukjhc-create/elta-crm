import { Metadata } from 'next'
import { EmailSettingsClient } from './email-settings-client'
import { getEmailTemplates } from '@/lib/actions/email'

export const metadata: Metadata = {
  title: 'E-mail indstillinger',
  description: 'Microsoft Graph e-mail og skabeloner',
}

export const dynamic = 'force-dynamic'

export default async function EmailSettingsPage() {
  const templates = await getEmailTemplates({ active_only: false })

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">E-mail indstillinger</h1>
        <p className="text-muted-foreground">
          Microsoft Graph forbindelse og e-mail skabeloner
        </p>
      </div>

      <EmailSettingsClient initialTemplates={templates} />
    </div>
  )
}
