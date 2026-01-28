import { getBuildingProfiles } from '@/lib/actions/kalkia'
import BuildingProfilesClient from './building-profiles-client'

export const metadata = {
  title: 'Bygningsprofiler | ELTA CRM',
  description: 'Administrer bygningsprofiler med multiplikatorer',
}

export default async function BuildingProfilesPage() {
  const profilesResult = await getBuildingProfiles()

  return (
    <BuildingProfilesClient
      profiles={profilesResult.success && profilesResult.data ? profilesResult.data : []}
    />
  )
}
