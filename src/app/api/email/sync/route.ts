import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  console.log('SYNC API ROUTE HIT')

  try {
    const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')

    console.log('SYNC START')
    const result = await runEmailSync()
    console.log('SYNC DONE', JSON.stringify({
      success: result.success,
      fetched: result.emailsFetched,
      inserted: result.emailsInserted,
      errors: result.errors,
      mailboxResults: result.mailboxResults,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('SYNC ERROR', error)
    return NextResponse.json(
      { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] },
      { status: 500 }
    )
  }
}
