/**
 * Svar når en påmindelse er gemt som CRM-opgave.
 * Kunden er ikke blevet ringet op. Insert og afsendelse ligger et andet sted.
 */
export function reminderSavedReply(title: string, when: string, reminderWhen: string): string {
  return `⏰ ${title} — ${when} (påmindelse ${reminderWhen}). Ligger i CRM. Kunden er ikke kontaktet.`
}
