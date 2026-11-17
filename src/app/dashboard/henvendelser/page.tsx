import type { Metadata } from 'next'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { listHenvendelser } from '@/lib/actions/henvendelser'
import { parseHenvendelseQuery } from '@/lib/reception/henvendelser-views'
import { uploadLinksEnabled } from '@/lib/reception/flags'
import { HenvendelserClient } from './henvendelser-client'

export const metadata: Metadata = { title: 'Henvendelser' }
export const dynamic = 'force-dynamic'


/**
 * AI-receptionist fase 2: én indbakke for alle kanaler (telefon, mail, SMS, portal/chat, upload-link). Læser via
 * listHenvendelser (conversations.view + RLS). Kunde/sag er KANDIDATER indtil de bekræftes her. Intet sendes herfra.
 */
export default async function HenvendelserPage({ searchParams }: { searchParams: Promise<{ filter?: string; channel?: string }> }) {
  const perms = await getPageRoleContext()
  if (!perms.has('conversations.view')) return <NoAccess permission="conversations.view" />
  const sp = await searchParams
  const { view: filter, channel } = parseHenvendelseQuery(sp.filter, sp.channel)
  const res = await listHenvendelser(filter, channel)
  return (
    <HenvendelserClient
      filter={filter}
      channel={channel}
      rows={res.success ? res.data.rows : []}
      error={res.success ? null : res.error}
      canManage={res.success ? res.data.canManage : false}
      canSimulate={perms.has('conversations.manage') && perms.has('conversations.view_unmatched')}
      uploadLinks={uploadLinksEnabled()}
    />
  )
}
