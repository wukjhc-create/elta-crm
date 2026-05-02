import { Metadata } from 'next'
import { PackagesAdminClient } from './packages-admin-client'
import {
  listAllPackagesAction,
  listTextBlocksAction,
} from '@/lib/actions/sales-engine'

export const metadata: Metadata = {
  title: 'Pakker & tilvalg',
  description: 'Administrer salgspakker, tilvalg og standardtekster',
}

export const dynamic = 'force-dynamic'

export default async function PackagesAdminPage() {
  const [packages, blocks] = await Promise.all([
    listAllPackagesAction(),
    listTextBlocksAction(),
  ])
  return <PackagesAdminClient initialPackages={packages} initialBlocks={blocks} />
}
