import { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditLogClient } from './audit-client'
import { pageHasPermission } from '@/lib/auth/page-guard'

export const metadata: Metadata = {
  title: 'Revisionslog',
  description: 'Se alle brugerhandlinger og ændringer i systemet',
}

export const dynamic = 'force-dynamic'

export default async function AuditLogPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  // PM2-13: RLS viser kun admin hele loggen — andre ser egne hændelser og skal vide det
  const fullLog = await pageHasPermission('users.view')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Spor alle handlinger og ændringer i systemet
        </p>
      </div>
      {!fullLog && (
        <p className="text-sm rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-amber-900">
          Du ser kun dine egne hændelser. Hele revisionsloggen er forbeholdt administratorer.
        </p>
      )}
      <AuditLogClient />
    </div>
  )
}
