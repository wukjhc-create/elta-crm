import { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LearningDashboardClient } from './learning-client'

export const metadata: Metadata = {
  title: 'AI Selvlæring',
  description: 'AI model performance og feedback statistik',
}

export const dynamic = 'force-dynamic'

export default async function LearningDashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Selvlærende Engine</h1>
        <p className="text-muted-foreground mt-1">
          Overvåg og kalibrer kalkulationssystemets nøjagtighed
        </p>
      </div>
      <LearningDashboardClient />
    </div>
  )
}
