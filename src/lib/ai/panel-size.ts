/**
 * S2 — ny eltavle vælges efter antal grupper (Henrik 2026-10-07), blandt ELTA-komponenterne
 * TAVLE-LILLE, TAVLE-S, TAVLE-NY, TAVLE-L.
 *
 * Katalogets egne data (prod, læst 2026-10-07) giver IKKE et entydigt grundlag:
 *   TAVLE-LILLE  "Undertavle 6-12 moduler" — beskrivelse: undertavle med HPFI og 4-6 grupper   kost 1.450 · 150 min
 *   TAVLE-S      "Tavle (lille)"            — beskrivelse: gruppetavle 6-12 grupper              kost   800 · 120 min
 *   TAVLE-NY     "Ny gruppetavle 12 modul"  — beskrivelse: ny 12-modul gruppetavle              kost 1.200 · 120 min
 *   TAVLE-L      "Tavle (stor)"             — beskrivelse: gruppetavle 18-36 grupper             kost 2.500 · 240 min
 * (overlap TAVLE-S/TAVLE-NY; hul 13-17 grupper; TAVLE-LILLE er en undertavle, ikke en ny hovedtavle)
 *
 * Derfor er de AKTIVE regler tomme, indtil Henrik godkender intervallerne — uden regel markeres tavlen "Ikke prissat".
 * Forslaget ligger i PROPOSED_PANEL_SIZE_RULES (bruges kun af sammenlignings-harnessen).
 */
export type PanelSizeRule = { maxGroups: number; code: string }

/** Godkendte regler (stigende maxGroups). TOM = ingen automatisk tavlevalg. */
export const PANEL_SIZE_RULES: PanelSizeRule[] = []

/** Forslag til godkendelse (ikke aktivt) */
export const PROPOSED_PANEL_SIZE_RULES: PanelSizeRule[] = [
  { maxGroups: 12, code: 'TAVLE-S' },
  { maxGroups: 36, code: 'TAVLE-L' },
]

/** Komponentkode for en ny tavle med `groups` grupper — null hvis ingen regel dækker (→ "Ikke prissat"). */
export function panelCodeForGroups(groups: number, rules: PanelSizeRule[] = PANEL_SIZE_RULES): string | null {
  if (!Number.isFinite(groups) || groups <= 0) return null
  const sorted = [...rules].sort((a, b) => a.maxGroups - b.maxGroups)
  return sorted.find((r) => groups <= r.maxGroups)?.code ?? null
}
