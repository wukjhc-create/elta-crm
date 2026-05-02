import { getRoomTypes } from '@/lib/actions/component-intelligence'
import { RoomTypesClient } from './room-types-client'

export const metadata = {
  title: 'Rumtyper | Kalkia Indstillinger',
  description: 'Konfigurer standard komponentforslag for forskellige rumtyper',
}

export const dynamic = 'force-dynamic'

export default async function RoomTypesPage() {
  const result = await getRoomTypes()

  return (
    <RoomTypesClient
      initialRoomTypes={result.success && result.data ? result.data : []}
    />
  )
}
