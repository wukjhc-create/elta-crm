/**
 * Citat i note-svaret. De første 120 tegn af den tekst der blev gemt.
 * Insert og afsendelse ligger et andet sted og røres ikke her.
 */
export function noteSavedReply(label: string, stored: string): string {
  const quote = stored.slice(0, 120)
  return `📝 Note gemt på ${label}. "${quote}"`
}
