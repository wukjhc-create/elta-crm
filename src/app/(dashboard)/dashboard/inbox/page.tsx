import { Metadata } from 'next'
import { Suspense } from 'react'
import { MessagesPageClient } from '@/components/modules/messages/messages-page-client'

export const metadata: Metadata = {
  title: 'Indbakke',
  description: 'Beskeder og kommunikation',
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Beskeder</h1>
              <p className="text-muted-foreground">Intern kommunikation</p>
            </div>
          </div>
          <div className="bg-white border rounded-lg p-12 text-center text-muted-foreground">
            Indlæser beskeder...
          </div>
        </div>
      }
    >
      <MessagesPageClient />
    </Suspense>
  )
}
