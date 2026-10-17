/**
 * Tidligere engangs-opsætning af Lemvigh-Müller-leverandør + SFTP-loginoplysninger via CRON_SECRET.
 *
 * API-2 (review 2026-10-17): slået fra (410). Med CRON_SECRET kunne man udskifte LM-værten/-login (den natlige
 * lemu-sync ville så hente prisfiler fra en vilkårlig vært) og brugernavnet blev gemt i klartekst i notes.
 * Loginoplysninger administreres i Indstillinger → Leverandører (credentials.ts: krypteret, admin-gate, test-forbindelse).
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { error: 'Gone', message: 'Opsætning sker i Indstillinger → Leverandører → Loginoplysninger' },
    { status: 410 },
  )
}
