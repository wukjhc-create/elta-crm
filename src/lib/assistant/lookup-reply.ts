/**
 * Svar når et assistent-opslag ikke er entydigt.
 * Ingen afsendelse og intet prod-flag.
 */
export function lookupReply(target: string, status: 'none' | 'ambiguous', labels: readonly string[]): string {
  if (status === 'none' || labels.length === 0) {
    return `Jeg fandt ingen kunde eller sag for "${target}".`
  }
  const list = labels.map((label) => `• ${label}`).join('\n')
  return `"${target}" passer på ${labels.length} — skriv kommandoen igen med kundenummer/sagsnummer:\n${list}`
}
