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
   | `offer`, `invoice`, `invoice_reminder` | Økonomi → `billing_contact` (faldback: `paying_customer`) | `resolveOfferMailRoute`, `resolveInvoiceMailRoute`, `resolveOfferReminderRoute`, `resolveQuoteMailRoute` (quote-generator) |
   | `fuldmagt` | Juridisk → `paying_customer` (cron-rykker uden sag-kontekst) | `resolveFuldmagtReminderRoute` |
   | `task_practical`, `task_technical` | Praktik → `site_contact` (fallback: `site_customer` → `paying_customer`) | `resolveTaskMailRoute`, `resolveServiceCaseConfirmationRoute` |
   | `besigtigelse` | Site-besøg → `site_contact` (fallback: `site_customer` → `paying_customer`) | `resolveBesigtigelseMailRoute` |
   | `reply_inbound`, `reply_thread` | Den der skrev til os (ekstern) | `resolveReplyRoute`, `resolveCustomerMailboxReplyRoute` |
   | `internal_notification` | Bevidst intern modtager (`@eltasolar.dk`) | `resolveInternalNotificationRoute` |
   | `manual` | Brugerens eksplicitte valg / fri-tekst recipient | `resolveManualCustomerMailRoute` eller override-grenen i hver resolver |

3. **`internal_notification` må KUN bruges til:**
   - Admin-alerts (system-advarsler).
   - Fuldmagt-admin-notifikation.
   - Portal/CRM intern notifikation (rejected offer, ny portal-besked).
   - Intern medarbejder-notifikation (fx tilbud accepteret/afvist).

   Den må **aldrig** bruges til kunde-mails, da `isInternalAllowed=true`
   skipper den eksterne-recipient-guard.

4. **Direkte `sendEmailViaGraph`-kald er kun tilladt i (whitelist):**
   - `src/lib/services/microsoft-graph.ts` — selve implementationen.
   - `src/lib/actions/email.ts:sendTestEmail` — test-flow til admin (recipient
     er bruger-tastet og logges separat).
   - `src/lib/actions/reminder-test.ts:sendTestReminder` — test-flow til
     den aktuelle bruger, ikke kunder.
   - `src/lib/automation/actions/send-email.ts:runSendEmail` — generic
     automation. Recipient kommer fra rule-config / event-payload uden
     domain-kontekst, så router-resolver kan ikke vælges. Filen
     håndhæver minimum-validering (tom/ugyldig email, intern-guard med
     opt-in `allow_internal`).

   Alle andre `sendEmailViaGraph`-kald skal gå gennem en resolver fra
   `src/lib/actions/mail-route-resolvers.ts` + `logMailRoute`.

5. **Besigtigelse / service-case regler (Phase 4):**
   - Besigtigelses-bekræftelser og praktiske service-case mails går aldrig
     til `billing_contact` som default — kun til betaler hvis ingen site
     er sat.
   - Hvis kun `customerId` er kendt (fx fra kundekortet eller
     portal-flowet) bruger routen `paying_customer` — det er accepteret
     og dokumenteret som gap. Service-case-flowet (`serviceCaseId`)
     bruger fuld site_contact → site_customer → paying_customer prioritet.
   - Inspectionsrapport-PDF'en sendes med `intent='besigtigelse'`;
     service-case-bekræftelse bruger `intent='task_practical'`.

6. **Manual / ad hoc compose regler (Phase 4):**
   - `resolveManualCustomerMailRoute` valideres KUN at recipient er
     ekstern og syntaks-gyldig — den gætter ikke recipient.
   - Bruges når UI'en allerede har en specifik recipient (compose-dialog,
     reply-picker override). For known kontekst (tilbud, faktura, sag)
     skal en kontekst-resolver bruges i stedet.

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
- **Phase 4** (Sprint 8H): besigtigelse + service-case + ad hoc compose
  (`resolveBesigtigelseMailRoute`, `resolveServiceCaseConfirmationRoute`,
  `resolveManualCustomerMailRoute`) + refactor af `besigtigelse.ts`,
  `portal.ts` (portalBookBesigtigelse + portalConfirmBesigtigelse),
  `customer-tasks.ts` (bookBesigtigelse), `service-cases.ts`
  (sendServiceCaseConfirmation), `customer-mailbox.ts`
  (sendEmailToCustomer).
- **Phase 5** (Sprint 8H): quote-generator (`resolveQuoteMailRoute`),
  cron fuldmagt-rykker (`resolveFuldmagtReminderRoute`), cron
  besigtigelse-rykker (genbruger `resolveBesigtigelseMailRoute`). Plus
  minimum-validering på `automation/actions/send-email.ts` og formel
  whitelist over de få direkte `sendEmailViaGraph`-kald der må bestå.
