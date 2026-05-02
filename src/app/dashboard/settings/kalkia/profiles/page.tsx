import { getBuildingProfiles } from '@/lib/actions/kalkia-settings'
import BuildingProfilesClient from './building-profiles-client'

export const metadata = {
  title: 'Bygningsprofiler',
  description: 'Administrer bygningsprofiler med multiplikatorer',
}

export const dynamic = 'force-dynamic'

export default async function BuildingProfilesPage() {
  const profilesResult = await getBuildingProfiles()

  return (
    <BuildingProfilesClient
      profiles={profilesResult.success && profilesResult.data ? profilesResult.data : []}
    />
  )
}
