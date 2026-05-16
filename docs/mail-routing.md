# Mail Routing — regler og guidelines

Sprint 8H indførte en central mail-router for at sikre at alle udgående
mails:

- har én korrekt recipient (intern-guard, self-reply-guard, syntaks)
- har en deklareret hensigt (intent) og rolle (recipientRole)
- har en menneske-læsbar audit-trail i loggen

## Kerne-regler

1. **Nye kunde-mails må IKKE kalde `sendEmailViaGraph` direkte.**
   Brug en resolver fra `src/lib/actions/mail-route-resolvers.ts` og
   send `route.toEmail` videre til `sendEmailViaGraph`.

2. **Intent bestemmer recipient-rollen:**

   | Intent | Hvem skal modtage | Resolver |
   |---|---|---|
   | `offer`, `invoice`, `invoice_reminder` | Økonomi → `billing_contact` (faldback: `paying_customer`) | `resolveOfferMailRoute`, `resolveInvoiceMailRoute`, `resolveOfferReminderRoute` |
   | `task_practical`, `task_technical` | Praktik → `site_contact` (faldback: kundens email) | `resolveTaskMailRoute` |
   | `reply_inbound`, `reply_thread` | Den der skrev til os (ekstern) | `resolveReplyRoute`, `resolveCustomerMailboxReplyRoute` |
   | `internal_notification` | Bevidst intern modtager (`@eltasolar.dk`) | `resolveInternalNotificationRoute` |
   | `manual` | Brugerens eksplicitte valg fra recipient-picker | Override-grenen i hver resolver |

3. **`internal_notification` må KUN bruges til:**
   - Admin-alerts (system-advarsler).
   - Fuldmagt-admin-notifikation.
   - Portal/CRM intern notifikation (rejected offer, ny portal-besked).
   - Intern medarbejder-notifikation (fx tilbud accepteret/afvist).

   Den må **aldrig** bruges til kunde-mails, da `isInternalAllowed=true`
   skipper den eksterne-recipient-guard.

4. **Direkte `sendEmailViaGraph`-kald er kun tilladt i:**
   - `src/lib/services/microsoft-graph.ts` (selve implementationen).
   - Test-flows (`reminder-test.ts`, `email.ts:sendTestEmail`).
   - Cron-jobs, der allerede bygger en route via en resolver.

## Audit-trail

Efter hver send (success eller fejl) skal `logMailRoute(route, outcome, meta)`
kaldes med:

- `outcome`: `'sent'` | `'blocked'` | `'failed'`
- `meta`: relevante kontekst-felter (`offer_id`, `invoice_id`, `task_id`,
  `customer_id`, fejlbesked osv.)

Dette gør det muligt at re-konstruere "hvor blev denne mail sendt hen og
hvorfor" på tværs af logs.

## Når intent eller recipient ikke er klar

**Stop.** Mail-routing-fejl er kostbare. Hvis du er i tvivl om:

- om en mail er intern eller ekstern
- om recipient er betaler, fakturakontakt eller site-kontakt
- om der findes en passende eksisterende resolver

→ åbn en mini-analyse i stedet for at gætte. En forkert recipient er
værre end at vente.

## Phase-historik

- **Phase 1B** (Sprint 8H): reply-flows + task-mail (`resolveReplyRoute`,
  `resolveTaskMailRoute`, `resolveCustomerMailboxReplyRoute`).
- **Phase 2** (Sprint 8H): tilbud, faktura, faktura-rykker, tilbuds-rykker
  (`resolveOfferMailRoute`, `resolveInvoiceMailRoute`,
  `resolveOfferReminderRoute`).
- **Phase 3** (Sprint 8H): intern-notifikation
  (`resolveInternalNotificationRoute`) + refactor af admin-alerts,
  fuldmagt-admin-notif, portal-CRM-notifs, public-offer
  medarbejder-notif.
