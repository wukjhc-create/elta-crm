/**
 * FIN2-9 (finans-review 2026-10-20): én fælles afrunding af kronebeløb til øre — halv øre rundes VÆK fra nul, som
 * PostgreSQL ROUND(numeric, 2) og e-conomic. `Math.round(n * 100) / 100` rundede 308,525 ned til 308,52 (binær
 * flydende komma: 30852,4999…) og gav 1 øres forskel mellem CRM, PDF og bogføring.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return n
  const sign = n < 0 ? -1 : 1
  // 1e-7 øre-tolerance retter flydende-komma-repræsentationen (…,4999999) uden at flytte rigtige beløb
  return (sign * Math.round(Math.abs(n) * 100 + 1e-7)) / 100
}
