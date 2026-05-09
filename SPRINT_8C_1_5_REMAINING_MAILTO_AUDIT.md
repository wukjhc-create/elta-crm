# Sprint 8C-1.5 — Audit af resterende mailto: i CRM

**Status:** Audit-only. Ingen kode-ændringer.
**Trigger:** Sprint 8C-1 erstattede mailto: PÅ TASK-ROW. Henrik bad om
verifikation af om der er andre overflader i CRM med samme datatap-risiko.
**Dato:** 2026-05-09

---

## TL;DR

Der er **4 high-value mailto:-overflader** i CRM der stadig lækker
kundekommunikation til Outlook, plus 4 medium-prioritet (HR/intern) og
1 low-prioritet (leverandør). Konverteringen kræver en generaliseret
`<SendMailDialog>`-komponent + nye server-actions per entitet — det er
en mellemstor refactor, IKKE en quick win.

**Anbefaling:** Sprint 8C-1.5 (1-2 dage) for at fjerne kunde-leak,
udsæt intern HR-mail og leverandør-mail til 8C-3+.

---

## 1. High-value leaks (Kunde-historik forsvinder)

Disse 4 mailto:-links er på kundecentriske CRM-detaljesider. Klik leaker
til Outlook → CRM mister historik.

### 1.1 `src/app/dashboard/customers/[id]/customer-detail-client.tsx`

**Linje 334** — Kundens primære email på detaljekortet:
```tsx
<a href={`mailto:${customer.email}`} className="font-medium text-primary hover:underline">
```

**Linje 500** — Kunde-kontaktpersoner i kontakt-tabellen:
```tsx
<a href={`mailto:${contact.email}`} className="hover:text-primary">
```

**Risk:** ⚠️ HIGH — Hver gang Henrik/sælger klikker på kundens mail på
detaljesiden, åbner Outlook. Den efterfølgende mail og svar findes ikke
i CRM.

### 1.2 `src/app/dashboard/leads/[id]/lead-detail-client.tsx`

**Linje 280** — Lead's email-adresse:
```tsx
<a href={`mailto:${lead.email}`} className="font-medium text-primary hover:underline">
```

**Risk:** ⚠️ HIGH — Lead-konvertering sker via mailkommunikation. Hvis
sælger sender via Outlook, mister vi sporet på hvilke leads der modtog
opfølgnings-mails.

### 1.3 `src/app/dashboard/orders/[id]/order-detail-client.tsx`

**Linje 282** — Kundens email i sagskortet (orders/service-cases):
```tsx
<a href={`mailto:${sag.customer.email}`} className="text-emerald-700 hover:underline">
```

**Risk:** ⚠️ HIGH — Når montøren eller serviceleder skriver til kunden
om en igangværende sag, forsvinder kommunikationen. Vi har ikke
"hvem-sagde-hvad-hvornår" på sagen.

---

## 2. Medium-prioritet (Intern HR-kommunikation)

Disse er medarbejder-email-links. Mindre kritiske for kundehistorik,
men ideelt skal også konverteres for fuldstændig kommunikations-trail.

### 2.1 `src/app/dashboard/employees/[id]/employee-detail-client.tsx`
- **Linje 129 + 214:** Medarbejderens email — bruges af HR/admin

### 2.2 `src/app/dashboard/employees/employees-list-client.tsx`
- **Linje 192:** Medarbejder-listens email-kolonne

### 2.3 `src/app/dashboard/orders/[id]/order-planning-tab.tsx`
- **Linje 443:** Email til den medarbejder der er tildelt en
  arbejdsseddel (work_order.employee.email)

**Risk:** 🟡 MEDIUM — Intern kommunikation har lavere sporings-krav. Men
hvis serviceleder skriver "kør til Vestergade kl 10" til montør via
mailto:, ligger den info kun i Outlook. CRM ved ikke at montør har fået
beskeden.

---

## 3. Low-prioritet (Leverandør)

### 3.1 `src/app/dashboard/settings/suppliers/[id]/supplier-detail-client.tsx`
- **Linje 131:** `supplier.contact_email` — kontakt til AO/LM

**Risk:** 🟢 LOW — Leverandør-kommunikation er typisk reklamationer
og ordreafklaringer. Mindre relevant for CRM-historik. Outlook-rute
er acceptabel her.

---

## 4. OK — disse SKAL forblive mailto:

### 4.1 Public-facing portal-sider

- `src/app/portal/invalid/page.tsx`
- `src/app/portal/layout.tsx`
- `src/components/modules/portal/offer-detail.tsx`
- `src/app/view-offer/[id]/offer-view-client.tsx` (linje 635, 660)

Alle har `mailto:kontakt@eltasolar.dk`. Dette er **kunde-til-firma**
direction. Når kunden skriver til kontakt@, lander mailen i den
indbakke vi senere syncer (8C-3). Korrekt opførsel.

### 4.2 Email-templates (HTML body af udgående mails)

- `src/lib/email/templates/crm-reply-email.ts`
- `src/lib/email/templates/offer-email.ts`
- `src/lib/email/templates/quote-email.ts`

Disse genererer HTML der sendes UD til kunden. mailto: i body lader
kunden klikke for at svare → svar lander i indbakke. Korrekt.

### 4.3 Allerede konverteret (8C-1)

- `src/app/dashboard/tasks/tasks-page-client.tsx` — Mail-knap åbner intern
  dialog
- `src/lib/actions/task-mail.ts` — server action
- `src/components/tasks/send-task-mail-dialog.tsx` — fallback only

---

## 5. Foreslået Sprint 8C-1.5 — minimal konvertering

### 5.1 Scope

Konvertér **kun de 4 high-value kunde-overflader** (§1):
1. customer-detail customer.email
2. customer-detail customer_contact.email
3. lead-detail lead.email
4. order-detail customer.email

Udsæt §2 (HR) og §3 (leverandør) til senere sprints.

### 5.2 Tekniske ændringer

#### a) Generaliseret komponent

**Ny:** `src/components/communication/send-mail-dialog.tsx`

Refactor af `send-task-mail-dialog.tsx` til at være generisk:
```tsx
<SendMailDialog
  context="customer" | "lead" | "order" | "task"
  contextId={uuid}
  recipient={email}
  recipientName={string}
  defaultSubject?={string}
  graphConfigured={boolean}
  onClose={() => void}
/>
```

Eksisterende `send-task-mail-dialog.tsx` deprecates (eller wrapper)
det generiske.

#### b) Nye server-actions

**Ny:** `src/lib/actions/customer-mail.ts`
- `sendCustomerEmail({ customer_id, to, cc?, subject, body })`
- Linker til `email_threads.customer_id` only (ingen offer/task-link)

**Ny:** `src/lib/actions/lead-mail.ts`
- `sendLeadEmail({ lead_id, ... })`
- Linker til `email_threads.customer_id` (hvis lead er konverteret) eller
  bare via lead-feltet (kræver migration: `email_threads.lead_id`)

**Ny:** `src/lib/actions/order-mail.ts` (måske kan genbruge customer-mail)
- `sendOrderEmail({ order_id, ... })`
- Linker til `email_threads.customer_id` + (8C-2 migration) `service_case_id`

#### c) Permission-keys

Genbrug eksisterende:
- `customers.edit` for customer-mail
- `leads.edit` for lead-mail
- `service.edit` for order-mail

#### d) UI-konvertering

For hver af de 4 mailto:-links:
- Erstat `<a href={mailto:...}>` med:
  ```tsx
  <button onClick={() => setMailDialog({ context, contextId, to: email })}>
    {email}
  </button>
  ```
- Mount `<SendMailDialog>` på siden, controlled by state

### 5.3 Estimat

| Opgave | Tid |
|---|---|
| Generaliser `SendMailDialog` (refactor af 8C-1 dialog) | 0.5 dag |
| Nye server-actions × 3 | 0.5 dag |
| Konvertér 4 mailto: + mount dialogs | 0.5 dag |
| Type-check, build, browser-test | 0.5 dag |
| **Total** | **2 dage** |

### 5.4 Ingen migration nødvendig

Alle 4 contexts kan link til `email_threads.customer_id` (eksisterende FK).
- Customer mail: `customer_id` direkte
- Customer contact mail: `customer_id` (kontaktpersonen er sub-record)
- Lead mail: hvis lead er konverteret til customer, brug `customer_id`.
  Hvis ikke, soft-ref via `template_variables.lead_id` (samme pattern som
  8C-1 task_id soft-ref)
- Order mail: order har customer_id → `email_threads.customer_id`

**Hård FK til lead/case kommer i 8C-2A migration** (planen er allerede skrevet).

---

## 6. Hvorfor ikke gøre 8C-1.5 nu autonomt?

Henrik har eksplicit sagt "ingen store refactors". 8C-1.5 kræver:
- Refactor af send-task-mail-dialog → generisk komponent (~150 linjer)
- 3 nye server-actions (~300 linjer)
- 4 UI-konverteringer (~80 linjer)
- Test-plan + browser-verify

Det er en mellemstor refactor (totalt ~500 linjer ny + ~50 linjer ændret),
ikke en quick win. Det bør være en eksplicit Henrik-godkendt sprint.

**Anbefaling:** Henrik godkender 8C-1.5 som dedikeret sprint efter at have
browser-testet 8C-1.

---

## 7. Quick wins der KAN gøres autonomt (uden at bryde regler)

Hvis Henrik vil have hurtige mikro-forbedringer:

### 7.1 Tilføj advarsel-tooltip på de 4 high-value mailto:

```tsx
<a
  href={`mailto:${customer.email}`}
  title="Outlook åbnes — gemmes IKKE i CRM. Brug 'Send mail om opgave' fra task for at gemme."
  ...
>
```

**Pros:** Minimal kode-ændring, gør problemet synligt for brugeren.
**Cons:** Symptombehandling — løser ikke problemet, lærer brugeren bare
at klikke videre i Outlook.

### 7.2 Tilføj hover-badge "(via Outlook — ingen CRM-historik)" ved siden af mailto:

Samme problem som 7.1 — symptom, ikke fix.

### 7.3 Skjul mailto:-links helt (defensivt)

Drastisk — bryder UX uden replacement. Gør IKKE dette.

**Konklusion:** Quick wins er ikke værd det. Vent på 8C-1.5 eller 8C-2.

---

## 8. Risiko ved at LADE være

| Risk | Påvirkning |
|---|---|
| Henrik tror 8C-1 dækker alle CRM-mails | HØJ — kan misforstå dækningsgrad |
| Ny medarbejder opdager kunde-mail-feltet og bruger Outlook flow | MEDIUM — afhænger af onboarding |
| Salgs-mail-historik bliver inkonsistent (tasks i CRM, customer-mail i Outlook) | HØJ — kerneproblemet vender tilbage |
| GDPR-eksport mister mails sendt fra customer-detail | MEDIUM — auditerbart men ufuldstændig |

---

## 9. Næste skridt

1. ✋ **Henrik browser-tester 8C-1** med flowet i slutrapporten
2. ✋ **Henrik beslutter:** skal 8C-1.5 gennemføres FØR 8C-2 (call_notes)?
   - Pro 8C-1.5 først: stopper datatap fra customer/lead/order pages
   - Pro 8C-2 først: opkald er den anden store tabskanal
3. ✋ **Hvis 8C-1.5 godkendes:** vis kode-plan + start sprint

**Status:** Audit fuldført. Ingen kode ændret. 9 mailto:-overflader
identificeret, 4 high-value, 4 medium, 1 low. Foreslået sprint 8C-1.5
til at fjerne kunde-leak.
