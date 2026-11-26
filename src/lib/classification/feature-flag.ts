/**
 * C1a klassifikationsfeedback — feature-flag (bevidst IKKE 'use server'; kun server-kode læser process.env).
 *
 * CLASSIFICATION_FEEDBACK_ENABLED='true' viser den diskrete klassifikationsboks i mailvisningen for ADMIN og tænder de
 * tilhørende server-handlinger. Standard FRA: boksen renderes ikke, og handlingerne returnerer "ikke aktiveret" uden at
 * røre databasen. Klassifikationen påvirker ALDRIG mailflowet — den vises og vurderes kun (Henrik 2026-11-26).
 */
export function classificationFeedbackEnabled(): boolean {
  return process.env.CLASSIFICATION_FEEDBACK_ENABLED === 'true'
}

export const CLASSIFICATION_FEEDBACK_DISABLED_TEXT = 'Klassifikationsfeedback er ikke aktiveret'
