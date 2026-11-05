/**
 * Kan sagen modtage en katalogvare? REN funktion. null = ja, ellers den danske afvisning.
 * Et sagsforslag er ikke en sag endnu, og en lukket, annulleret eller konverteret sag får ikke nyt materiale.
 */
export function caseAcceptsCatalogueMaterial(row: { status: string | null; is_proposal: boolean | null }): string | null {
  if (row.is_proposal) return 'Sagen er kun et forslag. Linjen er ikke oprettet.'
  if (row.status === 'closed' || row.status === 'cancelled' || row.status === 'converted') {
    return 'Sagen er ikke åben. Linjen er ikke oprettet.'
  }
  return null
}
