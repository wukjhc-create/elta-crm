/**
 * Parter fase B — feature-flag (bevidst IKKE 'use server'; kun server-kode læser process.env).
 *
 * PARTIES_UI_ENABLED='true' tænder panelerne "Parter & relationer" (kundekort) og "Sagsdeltagere" (sag/ordre) samt de
 * tilhørende server-handlinger. Standard FRA: panelerne renderes ikke, og hver handling returnerer "ikke aktiveret" UDEN at
 * røre databasen (inert kode). Aktivering i prod er et særskilt godkendelsestrin (Henrik 2026-11-25).
 */
export function partiesUiEnabled(): boolean {
  return process.env.PARTIES_UI_ENABLED === 'true'
}

export const PARTIES_DISABLED_TEXT = 'Parter er ikke aktiveret'
