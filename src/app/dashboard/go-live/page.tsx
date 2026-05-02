import { Metadata } from 'next'
import { GoLiveClient } from './go-live-client'
import { getGoLiveStatus } from '@/lib/actions/go-live'

export const metadata: Metadata = {
  title: 'Go-Live Admin',
  description: 'Operatorpanel for produktionsklar status og kontrol',
}

export const dynamic = 'force-dynamic'

export default async function GoLivePage() {
  const status = await getGoLiveStatus()
  return <GoLiveClient initialStatus={status} />
}
