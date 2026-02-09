import { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditLogClient } from './audit-client'

export const metadata: Metadata = {
  title: 'Revisionslog',
  description: 'Se alle brugerhandlinger og ændringer i systemet',
}

export const dynamic = 'force-dynamic'

export default async function AuditLogPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Spor alle handlinger og ændringer i systemet
        </p>
      </div>
      <AuditLogClient />
    </div>
  )
}
