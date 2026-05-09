# Sprint 8C — Communication Hub: Analyse & Teknisk Plan

**Status:** Analyse-only. Ingen kode. Ingen migration. Ingen DB-ændringer.
**Forfatter:** ELTA CRM tech-team
**Dato:** 2026-05-06
**Trigger:** Sprint 8B-1 quick action-knapper afslørede et arkitektonisk problem:
mailto: åbner Outlook → systemet mister svar, aftaler og kundens ønsker.

---

## 0. Baggrund — hvorfor er dette nødvendigt?

ELTA CRM er ved at blive virksomhedens single source of truth for kunder,
sager, tilbud og fakturaer. Men kommunikationen lever stadig spredt:

- Mails sendes fra Outlook → ingen tråd i CRM
- Opkald noteres på post-it eller i hovedet → ingen historik
- Indbakker (`hc@`, `faktura@`) læses i Outlook → kunden bliver rykket dobbelt,
  eller en aftale glemmes
- AO/LM ordre-bekræftelser ligger som mails → arbejdsbeskrivelser skrives manuelt

**Mål:** Al kundekommunikation bliver synlig og søgbar i kundens timeline,
sagens timeline, tilbuddets timeline og fakturaens timeline. Ingen mail
forsvinder. Ingen aftale ligger uden for systemet.

---

## 1. Eksisterende infrastruktur (det vi BYGGER OVENPÅ — ikke fra bunden)

CRM har allerede betydelig email-infrastruktur. Sprint 8C skal ikke
genopfinde dette — kun udvide og koble.

### 1.1 Tabeller der allerede findes

| Tabel | Migration | Bruges til |
|---|---|---|
| `email_templates` | 00033 | Genbrugelige skabeloner med `{{variable}}`-rendering |
| `email_threads` | 00033 | Tråde linket til `offer_id` + `customer_id`, status, counters |
| `email_messages` | 00033 | In/outbound, tracking-pixel, attachments, message_id |
| `email_events` | 00033 | open/click/bounce/delivered events |
| `incoming_emails` | 00049 | Graph API-ingestion m. AO-detection + customer-link |
| `graph_sync_state` | 00049 | Delta-link cursor pr. mailbox |
| `email_intelligence_logs` | 00072 | AI-processing pr. mail |
| `email_intelligence_daily_summary` | 00072 | Daglig opsummering |
| `case_notes` | 00073 | Notater på service_case (AI-summary, manual note, system) |
| `lead_activities` | 00002 | Lead-historik |
| `offer_activities` | 00012 | Tilbuds-historik |
| `messages` | 00003 | Intern medarbejder-besked |
| `portal_messages` | 00009 | Kundeportal chat |
| `sms_messages` | 00034 | Udgående SMS via GatewayAPI |

### 1.2 Services der allerede findes

| Fil | Funktion |
|---|---|
| `src/lib/services/microsoft-graph.ts` | OAuth client_credentials → send + læse mail |
| `src/lib/services/email-linker.ts` | Forwarded-sender extraction + customer-match |
| `src/lib/services/email-ao-detector.ts` | Detekterer AO-produkter i mailtekst |
| `src/lib/services/email-sync-orchestrator.ts` | Graph delta-poll cron |
| `src/lib/services/email-intelligence.ts` | AI-summary pipeline |
| `src/lib/actions/email.ts` | `sendOfferEmail`, template CRUD, tracking |
| `src/lib/actions/incoming-emails.ts` | Læs/markér incoming_emails |
| `src/lib/actions/email-intelligence.ts` | AI workflows |
| `src/lib/actions/customer-mailbox.ts` | Per-kunde mail-feed |

### 1.3 Eksisterende huller (det vi mangler at bygge)

1. **`email_threads`** kan KUN linkes til `offer_id` + `customer_id`.
   Mangler links til: `service_case_id`, `work_order_id`, `task_id`, `invoice_id`.
2. **Send-flow** er hardkodet til `sendOfferEmail` (tilbud).
   Ingen generisk "compose"-action der kan sendes fra hvilken som helst kontekst.
3. **`graph_sync_state`** har UNIQUE på `mailbox` og 1 seed-row (`crm@eltasolar.dk`).
   Skal kunne håndtere flere mailbokse (`hc@`, `faktura@`, `ordre@`, `support@`).
4. **Opkalds-noter** har INGEN tabel. `case_notes` er kun knyttet til service_cases.
   Ingen central "communication_log".
5. **"Ukendt indbakke"** findes som data (`incoming_emails.link_status='unidentified'`)
   men har ingen UI-rute.
6. **AI ordre-mail → arbejdsbeskrivelse** mangler: emailIntelligence detekterer
   indhold, men der er ingen pipeline der opretter `service_case` / `work_order` /
   tasks ud fra en ordre-mail.

---

## 2. Hvordan task → kunde-mail BØR fungere internt

### 2.1 Forkert flow (det vi har nu)

```
Task → Mail-knap → mailto:kunde@... → Outlook åbnes → kunden svarer i Outlook
       → Henrik glemmer at notere → CRM intet ved
```

### 2.2 Korrekt flow (det vi vil)

```
Task → Mail-knap → INTERN compose-dialog i CRM
                 → Pre-udfyldt: To = kunde, Subject = "Vedr. opgave: {title}"
                 → Body = template/blank
                 → Vælg afsender-mailbox: hc@, faktura@, support@
                 → Vælg trådkontekst: customer (default), task, offer, case, invoice
                 → Send via Microsoft Graph (sendEmailViaGraph)
                 → email_messages.direction='outbound' INSERT
                 → email_threads opdateres / oprettes
                 → activity-log på task: "Mail sendt af Henrik"
```

### 2.3 Trådkontekst-regler

Mail sendt fra:
- **Kunde-detalje** → thread linker `customer_id` only
- **Task** → thread linker `customer_id` + `task_id` (samt `offer_id`/`case_id` hvis task har det)
- **Tilbud** → thread linker `customer_id` + `offer_id`
- **Service-sag** → thread linker `customer_id` + `case_id`
- **Faktura** → thread linker `customer_id` + `invoice_id`
- **Indbakke (forward/svar)** → arver tråd-link fra det modtagne email

Når kunden svarer (incoming_emails matchet på conversation_id eller In-Reply-To
→ existing thread), bevares trådkonteksten automatisk. Indgående mails dukker op
i samme timeline hvor de blev sendt fra.

### 2.4 Visning på task-card

Under task vises i panel "Kommunikation":
```
📧 [3] Mails  📞 [1] Opkald  💬 [0] SMS
─────────────────────────────────
2026-05-06 14:23  Mail SENDT  Henrik → kunde@...
                  "Vedr. opgave: Skift HFI-relæ"
2026-05-06 16:01  Mail SVAR    kunde@... → hc@
                  "Tak — kan I komme i morgen?"
2026-05-07 09:14  Opkald 4 min Henrik → kunde
                  "Aftalt onsdag kl 10. Kunde lukker selv op."
```

---

## 3. Intern Send Mail-dialog — UX og adfærd

### 3.1 Komponentstruktur

`<ComposeMailDialog>` mountes som modal fra:
- Mail-ikon på task-row (Sprint 8B-1 quick action)
- "Send mail"-knap på customer/case/offer/invoice detail
- Reply/Forward-knap fra eksisterende mail i timeline

### 3.2 Felter

| Felt | Adfærd |
|---|---|
| **Fra** | Dropdown med firmaets mailbokse (kun dem brugeren har adgang til) |
| **Til** | Pre-udfyldt fra context. Kan tilføje flere modtagere. Validér mod `customer_contacts` for genkendt navn |
| **Cc / Bcc** | Skjult som default, åbnes på "+Cc" |
| **Emne** | Pre-udfyldt fra context-template. Fri redigerbar |
| **Skabelon** | Dropdown m. relevante `email_templates` (filtreret efter kontekst) |
| **Body** | Rich-text editor med variabel-substitution preview |
| **Vedhæft** | Multi-file upload + "Vedhæft tilbud-PDF" / "Vedhæft faktura-PDF" |
| **Gem som kladde** | INSERT `email_messages` med `status='draft'`. Kan genåbnes |
| **Send** | Validér → send via Graph → log thread/message → toast → luk |

### 3.3 Tre vigtige regler

1. **Aldrig mailto:** — Knappen åbner ALTID intern dialog. mailto: er kun
   fallback hvis Graph ikke er konfigureret (via env-flag).
2. **Hvert send efterlader spor i mindst 3 steder:**
   - `email_messages` (kanonisk)
   - `email_threads.last_message_at` opdateret
   - Aktivitetslog på relevant entitet (task/offer/case/invoice)
3. **Bounce/fejl synliggøres** — hvis Graph returnerer fejl eller bouncer,
   vises advarsel på kundens timeline + nagging-overlay til afsenderen.

### 3.4 Permissions

Ny permission-key i RBAC-matrix:
- `communication.send_email` — admin, serviceleder, sælger (ikke montør, ikke bogholder)
- `communication.view_threads` — alle roller (scope-filtreret af case-scope)
- `communication.delete_thread` — kun admin

---

## 4. Logning på alle entiteter — éns model

### 4.1 Princip: Polymorfisk timeline

Hver kommunikation (mail in/out, opkald, SMS, portal-besked) skal kunne
optræde i kundens samlede timeline OG i den specifikke entitets timeline.

To mulige modeller:

**Model A — Multi-FK på email_threads** (anbefalet)

Udvid `email_threads` med nullable kolonner:
```
service_case_id UUID NULL REFERENCES service_cases(id) ON DELETE SET NULL
work_order_id UUID NULL REFERENCES work_orders(id) ON DELETE SET NULL
task_id UUID NULL REFERENCES customer_tasks(id) ON DELETE SET NULL
invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL
```
Plus indexes på hver. Threads kan have flere kontekster (én tråd kan
relatere både til offer og case).

**Model B — Junction-tabel** `thread_contexts`
```
(thread_id, entity_type, entity_id)
```
Mere fleksibelt men dyrere at query.

**Anbefaling:** Model A — pragmatisk, dækker 95% af cases, mindre kompleksitet.
Hvis behov for many-to-many opstår senere, tilføj junction da.

### 4.2 Fælles "communication_log"-view

Et VIEW (ikke ny tabel) der UNION'er:
- `email_messages` (in + out)
- `sms_messages`
- `portal_messages`
- (senere) `call_notes`

Resultat-kolonner: `id, kind, customer_id, case_id, offer_id, task_id, invoice_id,
direction, subject_or_summary, body_preview, occurred_at, actor_id, actor_name`.

Bruges af alle "kommunikationspaneler" på de respektive detaljesider.

### 4.3 Pr. entitet — hvad vises hvor

| Entitet | Sektion | Indhold |
|---|---|---|
| **Customer** | Tab "Kommunikation" | ALLE mails/opkald/SMS for kunden, tværs af alle relaterede sager/tilbud/fakturaer |
| **Service-case** | Tab "Mails & Noter" | Threads m. `case_id`, plus `case_notes` (allerede der) |
| **Work-order** | Inline panel | Threads m. `work_order_id`, plus relaterede task-mails |
| **Task** | Højre-panel | Threads m. `task_id` ELLER mails sendt fra denne task |
| **Offer** | Tab "Aktivitet" | Threads m. `offer_id` (allerede delvist via `email_threads.offer_id`) |
| **Invoice** | Tab "Mails" | Threads m. `invoice_id` (kun rykkere, betalingspåmindelser, kontering-spørgsmål) |

---

## 5. Opkaldsnotater — Ring-knap → log

### 5.1 Forventet flow

```
Task/customer → Ring-knap → (dialog kommer SAMTIDIG som tel:)
                         → "Du ringer nu til Jens. Notér samtalen efter."
                         → tel: trigger
                         → Efter opkald: form pre-mountet
                            ▸ Hvem talte du med?
                            ▸ Hvor lang? (auto-tracker valgfrit)
                            ▸ Hvad blev aftalt?
                            ▸ Næste action? (opret task / book aftale / luk)
                         → Gem
```

### 5.2 Datamodel — ny tabel `call_notes`

```sql
call_notes
├─ id UUID PK
├─ customer_id UUID NOT NULL → customers
├─ contact_id UUID NULL → customer_contacts
├─ direction TEXT ('outbound'|'inbound'|'missed')
├─ phone_number TEXT
├─ duration_seconds INT
├─ summary TEXT NOT NULL          -- hvad blev aftalt
├─ next_action TEXT               -- 'task'|'meeting'|'callback'|'none'
├─ next_action_id UUID            -- fk til oprettet task/calendar_event
├─ task_id UUID NULL → customer_tasks
├─ service_case_id UUID NULL → service_cases
├─ work_order_id UUID NULL → work_orders
├─ offer_id UUID NULL → offers
├─ invoice_id UUID NULL → invoices
├─ created_by UUID → profiles
├─ created_at TIMESTAMPTZ
└─ called_at TIMESTAMPTZ           -- kan rettes manuelt hvis log er bagud
```

### 5.3 Ring-knap-adfærd (smart default)

- Mobil: tel:-link åbner direkte. Efter knappen klikkes, mountes
  notat-dialogen med 3-sekunders forsinkelse (giver tid til opkaldet starter).
  Efter samtalen klikker brugeren tilbage til CRM → dialog ligger klar.
- Desktop: Mountes umiddelbart efter klik (uden tel:-handler hvis ikke konfigureret).
- "Spring notat over" tillades men logges som `summary='(intet notat)'` så vi
  stadig har et opkalds-spor.

### 5.4 Senere udvidelser (out of 8C-2 scope)

- VoIP-integration (3CX, Aircall) → automatisk opkalds-detection
- Optagelser → audio-attachment + Whisper-transkription
- "Missed call"-detection fra mobil-CRM-app

---

## 6. Indbakke-import — flere mailbokse

### 6.1 Mailbokse der skal læses

| Mailbox | Formål | Auto-link til |
|---|---|---|
| `hc@eltasolar.dk` | Personlig sælger-indbakke | Customer / offer / lead |
| `faktura@eltasolar.dk` | Fakturaspørgsmål, rykkere, kontering | Invoice / customer |
| `support@eltasolar.dk` | Reklamationer, fejlmeldinger | Service-case / work-order |
| `ordre@eltasolar.dk` | Ordrebekræftelser fra grossister (AO, LM) | Supplier-order / projekt |
| `info@eltasolar.dk` | Generel henvendelse | Lead-creation pipeline |
| `crm@eltasolar.dk` | (eksisterende) Standard ingestion | (eksisterende) |

### 6.2 Datamodel-ændring

`graph_sync_state` har allerede `mailbox UNIQUE` — kan tilføje rows direkte.
Men vi mangler:

1. **`email_accounts`-tabel** — beskriv per-mailbox config:
   ```
   email_accounts
   ├─ id UUID PK
   ├─ address TEXT UNIQUE              -- 'hc@eltasolar.dk'
   ├─ display_name TEXT                -- 'Henrik Christensen'
   ├─ purpose TEXT                     -- 'sales'|'finance'|'support'|'orders'|'general'
   ├─ is_active BOOLEAN
   ├─ default_link_strategy JSONB      -- regler for auto-linking
   ├─ allowed_senders UUID[]           -- hvilke profiles må sende fra denne
   ├─ signature_html TEXT
   └─ created_at, updated_at
   ```

2. **`email_sync_jobs`-tabel** — pr. mailbox, planlagt sync:
   ```
   email_sync_jobs
   ├─ id UUID PK
   ├─ account_id UUID → email_accounts
   ├─ schedule_cron TEXT                -- '*/5 * * * *'
   ├─ last_run_at TIMESTAMPTZ
   ├─ next_run_at TIMESTAMPTZ
   ├─ status TEXT                       -- 'idle'|'running'|'failed'
   ├─ last_error TEXT
   └─ updated_at
   ```

3. **`incoming_emails.email_account_id`** — FK til hvilken mailbox det kom fra
   (vigtigt for routing og link-regler).

### 6.3 Auto-link-regler pr. mailbox

| Mailbox | Match-prioritet |
|---|---|
| `hc@` | 1) Match conversation_id mod existing thread, 2) match sender mod customer_contacts.email, 3) match sender-domain mod customers.email-domain |
| `faktura@` | 1) Subject regex `Faktura\s+(\d+)` → match mod `invoices.invoice_number`, 2) sender → customer |
| `support@` | 1) sender → customer → opret service_case hvis ingen åben, 2) match subject mod existing case |
| `ordre@` | 1) sender domain → supplier (ao.dk, lemu.dk), 2) parse PDF/CSV → match mod existing supplier_order |
| `info@` | 1) sender → existing customer/lead, 2) hvis ukendt → opret lead i `pending`-status |

Alle der ikke matcher → `link_status='unidentified'` → vises i UI-rute "Ukendt indbakke".

### 6.4 "Ukendt indbakke"-UI

Ny side `/dashboard/mail/unidentified`:
- Liste over emails hvor `link_status='unidentified'`
- Per-row: 3 quick-actions
  - "Match til kunde" → søg + vælg
  - "Opret som lead" → ny kunde fra mail-data
  - "Markér som irrelevant" → `link_status='ignored'`
- Bulk-actions
- Counter i sidebar (badge)

---

## 7. AI ordre-mail → arbejdsbeskrivelse

### 7.1 Use case

Kunde sender mail til `info@` eller `hc@`:
```
"Hej, vores HFI-relæ slår fra ca. 2x om ugen i køkkenet. Adresse:
Vestergade 12, 8000 Aarhus. Vi er hjemme efter kl 16. Mvh Lars"
```

I dag: Henrik læser mailen, opretter manuelt service_case, skriver
arbejdsbeskrivelse, opretter task, tildeler montør.

Sprint 8C-4: Systemet gør det automatisk. Henrik godkender.

### 7.2 Pipeline

```
incoming_emails (linked) → email_intelligence-agent
                         → klassifikation: 'service_request'|'order'|'inquiry'|'invoice_question'
                         → hvis 'service_request' eller 'order':
                            ▸ extract: hvad er problemet?
                            ▸ extract: adresse / placering
                            ▸ extract: tilgængelighed (datoer, tidspunkter)
                            ▸ extract: kontaktoplysninger
                            ▸ extract: hastegrad
                         → forslag-objekt:
                            {
                              suggested_case: {
                                customer_id, title, description, urgency,
                                preferred_dates: [...],
                                customer_requirements: "...",
                                technician_instructions: "..."
                              },
                              suggested_tasks: [
                                {title: "Ring og bekræft tid", ...},
                                {title: "Kør til adresse + udskift relæ", ...}
                              ]
                            }
                         → INSERT i ny tabel `ai_email_proposals`
                            (status='pending')
                         → notifikation til serviceleder
```

### 7.3 Godkendelses-UI

`/dashboard/mail/proposals`:
- Liste over pending forslag
- Ekspander → vis original mail + AI-forslag side-by-side
- Knapper: "Godkend (opret sag)" / "Rediger først" / "Afvis"
- Ved godkendelse: opret service_case + tasks + link til original incoming_email
- Ved afvisning: kræv begrundelse → træningsdata til AI

### 7.4 Datamodel — ny tabel `ai_email_proposals`

```
ai_email_proposals
├─ id UUID PK
├─ incoming_email_id UUID NOT NULL → incoming_emails
├─ proposal_type TEXT                -- 'service_case'|'order_intake'|'lead'
├─ confidence NUMERIC(3,2)           -- 0.00-1.00
├─ payload JSONB                     -- foreslået data (case + tasks)
├─ status TEXT                       -- 'pending'|'approved'|'rejected'|'edited'
├─ reviewed_by UUID → profiles
├─ reviewed_at TIMESTAMPTZ
├─ rejection_reason TEXT
├─ created_case_id UUID → service_cases   -- når godkendt
├─ created_at TIMESTAMPTZ
└─ updated_at TIMESTAMPTZ
```

### 7.5 Senere — ordre-bekræftelser fra AO/LM

Samme pipeline, men `proposal_type='order_intake'`. Parser PDF-vedhæftning
(allerede har `incoming_invoice-parser.ts`-infrastruktur). Foreslår:
- Modtaget-bekræftelse på existing supplier_order
- Eller opret ny supplier_order hvis ingen findes
- Opdater materialepriser i kalkulation hvis ordren bekræfter pris

---

## 8. Manglende tabeller — samlet liste

Ingen migration laves nu. Listen viser hvad fremtidige sprints skal tilføje.

### 8.1 NYE tabeller (sprint 8C-1 → 8C-4)

| Tabel | Sprint | Formål |
|---|---|---|
| `email_accounts` | 8C-3 | Per-mailbox config + signaturer + tilladelser |
| `email_sync_jobs` | 8C-3 | Cron + status pr. mailbox |
| `call_notes` | 8C-2 | Opkalds-historik knyttet til alle entiteter |
| `ai_email_proposals` | 8C-4 | AI-forslag før manuel godkendelse |

### 8.2 UDVIDELSER til eksisterende tabeller

| Tabel | Tilføjelse | Sprint |
|---|---|---|
| `email_threads` | `service_case_id`, `work_order_id`, `task_id`, `invoice_id` | 8C-1 |
| `email_messages` | (intet — modellen er fin) | — |
| `incoming_emails` | `email_account_id` FK | 8C-3 |
| `graph_sync_state` | drop UNIQUE? eller behold med en row pr. mailbox (tilstrækkeligt) | 8C-3 |

### 8.3 Tabeller vi IKKE behøver (allerede dækket)

- `messages` — eksisterende intern besked (uændret)
- `communication_logs` — IKKE en tabel, lav som DB VIEW der UNION'er kilder
- `message_threads` — eksisterende `email_threads` dækker behovet (efter udvidelse)

---

## 9. Datatab-strategi — "ingen mail/opkald må forsvinde"

### 9.1 Outbound (sendt fra CRM)

- ALT går gennem `sendEmailViaGraph` → INSERT `email_messages` FØR send
- Hvis Graph fejler: status='failed', men row bevares + retry-cron
- Bounces → `email_events` + visning på timeline + nagging-task

### 9.2 Inbound (modtaget i firmaets indbakker)

- Graph delta-poll hver 5 min pr. mailbox (cron)
- INSERT `incoming_emails` med `link_status='pending'`
- Linker-cron kører hver 1 min → forsøger auto-match
- 4 udfald:
  - `linked` → optræder i kundens timeline
  - `unidentified` → optræder i "Ukendt indbakke" til manuel match
  - `ignored` → manuelt afvist (spam, intern mail, irrelevant)
  - `pending` → endnu ikke processeret (kun midlertidig tilstand)

### 9.3 Race-conditions og duplikater

- `incoming_emails.graph_message_id UNIQUE` → naturlig dedup
- `email_messages.message_id` (RFC 822 Message-ID header) → bør indekseres
  unique for at undgå at samme indkommende mail logges 2x
- Outlook reply-chains: brug `In-Reply-To`-header + `conversation_id` til
  at samle i existing thread (begge dele — Graph leverer conversation_id,
  IMAP/SMTP fallback bruger In-Reply-To)

### 9.4 Manuelt forwardede mails (fra Henriks Outlook → hc@)

- `email-linker.ts` har allerede forwarded-sender extraction
- Når Henrik forwardede en kunde-mail til hc@ for at få den i CRM, skal:
  - Original sender (kunde) bruges til auto-link
  - Subject "VS:"/"Fwd:" trimmes til ren subject
  - Original body bevares som body, forward-headers fjernes fra preview

### 9.5 "Ukendt indbakke" — eskalering

- Hvis en mail har været `unidentified` i > 7 dage → email til admin
- Counter på dashboard som task-reminder (eksisterende `TaskReminderOverlay`)
- Aldrig auto-slet — kun manuel `ignored`

---

## 10. Risikoanalyse

### 10.1 GDPR

**Risk:** Kundens personlige mails / opkalds-noter ligger i CRM. Hvis kunden
udøver "ret til sletning", skal vi kunne slette ALT om dem.

**Mitigation:**
- Dedikeret `deleteCustomerCompletely(customerId)`-server-action der:
  - Sletter `email_messages` via thread cascade
  - Sletter `call_notes`
  - Sletter `incoming_emails` (eller anonymiserer)
  - Logger sletningen i audit-log
- Backup/eksport-funktion FØR sletning (kunden kan kræve dataudlevering)
- Retention-policy: ukendte mails ældre end 12 mdr → auto-anonymisering

**Risk:** Cc/Bcc kan utilsigtet eksponere kundedata.
**Mitigation:** Compose-dialog viser advarsel hvis Cc indeholder eksterne adresser.

### 10.2 Mail-credentials

**Risk:** Graph access-tokens kompromitteres → angribere kan læse alle firmaets
mails OG sende på vegne af firmaet.

**Mitigation (allerede delvist på plads):**
- Brug Graph client_credentials flow (app-only auth, ingen brugertokens i klient)
- Tokens caches kun in-memory (ikke i DB)
- Secrets i Vercel env vars, ikke i kode (allerede praksis)
- `ENCRYPTION_KEY` (AES-256-GCM) til alt vi VIL persistere
- Mailbox-til-app permissions skal scopes så snævert som muligt
  (`Mail.Read` + `Mail.Send` på SPECIFIKKE mailbokse, ikke Mail.ReadWrite.All)

### 10.3 Gmail/Microsoft OAuth

**Risk:** Hvis vi senere tilbyder OAuth pr. medarbejder (i stedet for app-auth),
står vi med mange refresh-tokens at beskytte.

**Mitigation:**
- Sprint 8C-3 bruger KUN app-auth mod fælles mailbokse (hc@, faktura@ osv)
- Personlig OAuth (Henriks egen Gmail) parkeres til senere sprint
- Hvis det kommer: tokens i `email_accounts.encrypted_refresh_token` med samme
  AES-256-GCM som supplier_credentials

### 10.4 Dubletter

**Risk:** Samme mail logges flere gange (Graph poll + manuel forward + reply-chain).

**Mitigation:**
- `incoming_emails.graph_message_id UNIQUE`
- `email_messages.message_id`-index (skal tilføjes som UNIQUE i 8C-1 migration)
- Linker tjekker conversation_id INDEN ny thread oprettes

### 10.5 Forkert kunde-match

**Risk:** Linker linker mail fra `lars@gmail.com` til forkert kunde fordi
domænet matcher flere.

**Mitigation:**
- Match-prioritet: 1) email-exact, 2) contact-email-exact, 3) domain (KUN hvis
  domain har 1 unik kunde-match — ellers `unidentified`)
- Confidence-score logges
- Hvis confidence < 0.8 → manuel verifikation kræves
- Audit-log på alle auto-links → admin kan auditere og rulle tilbage

### 10.6 Medarbejder-adgang

**Risk:** Bogholder ser sælger-mails. Montør ser fakturaspørgsmål. Læk på tværs.

**Mitigation:**
- RBAC permissions:
  - `mail.view_sales` (sælger, admin)
  - `mail.view_finance` (bogholder, admin)
  - `mail.view_support` (serviceleder, montør, admin)
  - `mail.view_all` (kun admin)
- Per-mailbox tilladelse via `email_accounts.allowed_senders`
- Case-scope filter genbruges: montør ser KUN mail-tråde tilknyttet egne sager
- RLS på `email_messages` (kommer i 8C-1) skal respektere case-scope

### 10.7 Compliance — call recording

**Risk:** Hvis vi senere optager opkald, skal kunden samtykke (DK lov).

**Mitigation:** Out of scope for 8C-2 (kun manuelle notater). Når VoIP integreres,
kræves separat samtykke-flow.

### 10.8 AI-fejltolkning

**Risk:** AI læser ordre-mail forkert → opretter forkert sag → montør kører
til forkert adresse.

**Mitigation:**
- ALDRIG auto-execute. AI laver KUN forslag i `ai_email_proposals.status='pending'`
- Manuel godkendelse kræves før case/tasks oprettes
- Confidence-score vises tydeligt i UI ("AI er 73% sikker")
- Afvisninger logges som træningsdata
- Adresser dobbeltverifikeres mod existing customers før forslaget genereres

---

## 11. Sprint-opdeling

### Sprint 8C-1 — Intern Mail-dialog + Log
**Mål:** Erstat mailto: med intern compose-dialog. Mails logges på alle
relaterede entiteter.

**Leverancer:**
- Migration: udvid `email_threads` med 4 nye nullable FKs (case/work_order/task/invoice)
- Index: UNIQUE på `email_messages.message_id`
- `<ComposeMailDialog>` komponent (fra hvilken som helst kontekst)
- Generisk server-action `sendEmail(input)` (ikke kun offer)
- `<CommunicationTimeline>` komponent — bruges på customer/case/task/offer/invoice
- DB VIEW `v_communication_log` (UNION email + sms + portal + future call_notes)
- RBAC: `communication.send_email`, `communication.view_threads`, `communication.delete_thread`
- Mail-knap på task/customer/case/offer/invoice åbner ALTID intern dialog
- Browser-test guide

**Afhængigheder:** Microsoft Graph er allerede konfigureret. Ingen nye env-vars.

**Estimat:** 4-6 dages arbejde. Mellemstor risiko (RBAC + RLS-kompleksitet).

### Sprint 8C-2 — Opkaldsnotater
**Mål:** Ring-knap → log opkaldsnotater → vises i kommunikations-timeline.

**Leverancer:**
- Migration: ny tabel `call_notes` med multi-FK
- `<CallNoteDialog>` mountes efter Ring-knap klik (3-sek delay på mobil)
- Server-actions: `createCallNote`, `updateCallNote`, `getCallNotesForCustomer`
- Integrér `call_notes` i `v_communication_log` VIEW (alter VIEW)
- "Næste action"-flow: opret task/aftale fra notatet
- RBAC: `communication.log_call`
- Browser-test: mobile + desktop

**Afhængigheder:** 8C-1 (CommunicationTimeline-komponent).

**Estimat:** 2-3 dage.

### Sprint 8C-3 — Indbakke-import (multi-mailbox)
**Mål:** Læs `hc@`, `faktura@`, `support@`, `ordre@`, `info@`. Auto-link til
kunde/sag/faktura. UI for "Ukendt indbakke".

**Leverancer:**
- Migration: ny `email_accounts`-tabel + `email_sync_jobs`
- Migration: `incoming_emails.email_account_id` FK
- Refaktor `email-sync-orchestrator.ts` til at iterere over `email_accounts`
- Per-mailbox link-strategier i `email-linker.ts`
- Cron `/api/cron/mailbox-sync` kører hver 5 min, parallel pr. mailbox
- Side `/dashboard/mail/unidentified` med list + bulk-actions
- Side `/dashboard/mail/accounts` til admin-konfiguration
- Sidebar badge: antal ukendte mails
- Eskalering: ukendte > 7 dage → admin-mail
- RBAC: `mail.manage_accounts`, `mail.view_unidentified`

**Afhængigheder:** 8C-1 (email_threads-udvidelser så indkommende kan linkes til
case/invoice via subject-regex match).

**Estimat:** 5-7 dage. HØJ risiko — flere mailbokse, edge cases ved forwards,
race conditions.

### Sprint 8C-4 — AI ordre-mail → arbejdsbeskrivelse
**Mål:** AI læser indkommende mails og foreslår service_case + tasks. Manuel
godkendelse.

**Leverancer:**
- Migration: ny tabel `ai_email_proposals`
- Service `email-to-case-engine.ts`: klassifikation + extraction
- Cron `/api/cron/email-proposals` kører hver 10 min på `linked` mails
- Side `/dashboard/mail/proposals` med side-by-side godkendelses-UI
- Server-actions: `approveProposal`, `rejectProposal`, `editProposal`
- Notifikation til serviceleder ved ny pending proposal
- Læring-loop: `rejection_reason` feeder tilbage til prompt-tuning
- AO/LM ordre-bekræftelses-parsing (genbruger `incoming-invoice-parser`)
- RBAC: `mail.review_proposals`, `mail.approve_proposals`

**Afhængigheder:** 8C-1, 8C-3 (linked emails, account routing).

**Estimat:** 6-8 dage. HØJ risiko — AI-præcision, prompt-tuning, hallucination-control.

---

## 12. Ud-af-scope (eksplicit IKKE i 8C)

- VoIP-integration (3CX, Aircall, Twilio)
- Opkalds-optagelse + transkription
- Personlig OAuth pr. medarbejder (kun fælles mailbokse i 8C-3)
- WhatsApp Business / FB Messenger integration
- Auto-execute af AI-forslag (alt skal manuelt godkendes i 8C-4)
- Multi-tenant mail (ELTA Solar er en virksomhed)
- Migrering af gamle Outlook-mails (kun nye fra 8C-3 deploy-tidspunkt)

---

## 13. Konklusion

CRM har allerede 70% af email-infrastrukturen. Sprint 8C handler ikke om
at bygge fra bunden, men om at:

1. **Udvide** `email_threads` med multi-entitets-links (8C-1)
2. **Erstatte mailto:** med en intern compose-dialog som rute alt gennem CRM (8C-1)
3. **Tilføje** opkalds-noter som første-klasses kommunikationsobjekt (8C-2)
4. **Opskalere** Graph-sync fra 1 til 6 mailbokse + UI for ukendte (8C-3)
5. **AI-augmentere** indgående mails til case/task-forslag (8C-4)

Resultat: Når en kunde mailer, ringer eller får sendt en mail, så ligger
alt i CRM — synligt i kundens, sagens, tilbuddets og fakturaens timeline.
Henrik glemmer aldrig en aftale igen. Montøren ser hvad kunden har sagt.
Bogholder ser hvad fakturaspørgsmål kunden har sendt. Intet falder mellem
stolene.

---

**Næste skridt (kræver eksplicit godkendelse fra Henrik):**

- Hvilken sprint starter vi med? (Anbefaling: 8C-1, fordi det fjerner den akutte
  Outlook-leak fra Sprint 8B-1)
- Skal vi inkludere portal_messages i `v_communication_log` allerede i 8C-1?
- Hvilken Graph-permission-scope er ELTAs Azure-app godkendt til i dag? Det
  påvirker om 8C-3 kan deploy'es uden ny IT-godkendelse.

**Stoppet efter analyse. Ingen kode skrevet. Ingen migration kørt.**
