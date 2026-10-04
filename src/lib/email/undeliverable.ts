/**
 * N80: adresser der aldrig kan modtage mail. Mail-automatikken giver kunder uden e-mail en pladsholder
 * `auto+<kundenr>@elta-crm.local` (N74) — `.local` er reserveret (RFC 6762) og kan ikke leveres. Afsendelse til sådan en
 * adresse afvises FØR transporten med en forståelig besked i stedet for en bounce/teknisk fejl. Ren logik.
 */
// Kun de reserverede navne pladsholderen bruger — IKKE .test/.example (harness-adresser skal opføre sig som før)
const RESERVED_TLDS = /\.(local|localhost|invalid)$/i

export function undeliverableRecipients(to: string | string[] | null | undefined): string[] {
  const list = (Array.isArray(to) ? to : [to ?? '']).flatMap((t) => String(t).split(','))
  return list
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => {
      const m = /<?([^<>\s]+@[^<>\s]+)>?\s*$/.exec(r)
      const domain = (m ? m[1] : r).split('@')[1]?.toLowerCase() ?? ''
      return !domain || RESERVED_TLDS.test(domain)
    })
}

export const UNDELIVERABLE_MESSAGE = 'Modtageren har ingen rigtig e-mailadresse (kunden er oprettet automatisk uden e-mail) — ret kundens e-mail først'
