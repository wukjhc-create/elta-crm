# Sprint 8C-2 — Opkaldsnotater + Communication Timeline (PLAN)

**Status:** Plan-only. Ingen kode. Ingen migration. Ingen DB-ændringer endnu.
**Forudsætninger:** Sprint 8C-1 (intern Send Mail-dialog) er deployet og verificeret.
**Trigger:** Sprint 8C-1 erstattede mailto: med intern CRM-mail. Næste hul i
kommunikationslaget: opkald har ingen historik. Henrik ringer fra mobil
via Sprint 8B-1 Ring-knappen, men aftalen ligger kun i hans hoved.

---

## 1. Hvad mangler — opkalds-flowet i dag

### 1.1 Det vi har nu

```
Task / customer-quick-action → Ring-knap → tel:<nummer> → mobilen ringer op
                                                       → samtale sker
                                                       → CRM ved INTET
```

Resultat: Henrik laver mundtlig aftale med kunden. Aftalen forsvinder.
Hvis kunden ringer tilbage og spørger til aftalen, har Henrik (eller en
kollega) ingen reference. Hvis Henrik er syg, kan andre ikke følge op.

### 1.2 Det vi vil

```
Task / customer → Ring-knap → tel:<nummer> + samtidig mountes
                              "Tilføj opkaldsnotat"-overlay
                            → samtale sker
                            → Bruger vender tilbage til CRM
                            → Overlay venter med pre-mountet form
                            → Hurtig udfyldning (titel, varighed, resumé,
                              næste action)
                            → Gem → call_notes-row + evt. ny task
                            → Synlig på kunden, opgaven, sagen
```

---

## 2. Forslag til datamodel — `call_notes`

### 2.1 Tabel-struktur (forslag — kræver Henriks approval før kørsel)

```sql
-- KRÆVER APPROVAL FØR KØRSEL
CREATE TABLE call_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hvem ringede / blev der ringet til
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound','missed')),
  phone_number TEXT,                          -- E.164 eller fri tekst
  contact_name TEXT,                          -- Navn på den person der talte (kan være forskelligt fra customer.contact_person)

  -- Hvilken kunde / kontaktperson (NULLABLE — ukendt opkald kan logges)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL,

  -- Hvilken kontekst opkaldet hører til (alle nullable — der bør altid være MINDST 1 sat)
  task_id UUID REFERENCES customer_tasks(id) ON DELETE SET NULL,
  service_case_id UUID REFERENCES service_cases(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Indhold
  title TEXT,                                 -- Kort titel (auto-genereret hvis tom: "Opkald til {customer}")
  summary TEXT NOT NULL,                      -- Hvad blev aftalt
  duration_seconds INTEGER,                   -- Optional: hvor langt opkaldet var
  outcome TEXT,                               -- 'completed','left_voicemail','no_answer','wrong_number','call_back_later'

  -- Næste action (auto-link til oprettet task)
  next_action_type TEXT,                      -- 'task','meeting','callback','none'
  next_action_id UUID,                        -- FK til oprettet task/calendar_event (uden CASCADE for at bevare historik)
  next_action_due TIMESTAMPTZ,                -- Hvornår skal næste action ske

  -- Hvem registrerede opkaldet
  created_by UUID NOT NULL REFERENCES profiles(id),

  -- Tidsstempler
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Kan rettes manuelt ved bagudlogning
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_notes_customer ON call_notes(customer_id);
CREATE INDEX idx_call_notes_task ON call_notes(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_call_notes_case ON call_notes(service_case_id) WHERE service_case_id IS NOT NULL;
CREATE INDEX idx_call_notes_created_by ON call_notes(created_by);
CREATE INDEX idx_call_notes_called_at ON call_notes(called_at DESC);

-- RLS — afventer Henriks approval. Forslag:
ALTER TABLE call_notes ENABLE ROW LEVEL SECURITY;

-- Authenticated kan læse alt der hører til kunder de har adgang til
-- (RLS-politik forenklet — montor-scope håndteres i server-action via case-scope helper)
CREATE POLICY "call_notes_select" ON call_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "call_notes_insert" ON call_notes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "call_notes_update" ON call_notes
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "call_notes_delete" ON call_notes
  FOR DELETE TO authenticated USING (created_by = auth.uid());
  -- Brugere kan kun slette egne notater. Admin via service_role.

GRANT SELECT, INSERT, UPDATE, DELETE ON call_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON call_notes TO service_role;

-- Auto-update updated_at
CREATE TRIGGER trg_call_notes_updated
  BEFORE UPDATE ON call_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Hvorfor disse FKs?

| FK | Forklaring |
|---|---|
| `customer_id` | Altid sat når opkaldet hører til en kunde — også hvis det ikke er knyttet til en specifik task |
| `customer_contact_id` | Hvilken kontaktperson hos kunden — kan være forskellig fra customer.contact_person |
| `task_id` | Hvis opkaldet handlede om en bestemt task |
| `service_case_id` | Hvis opkaldet handlede om en bestemt service-sag |
| `work_order_id` | Hvis montøren ringer fra en specifik arbejdsseddel |
| `offer_id` | Hvis sælger ringer for at følge op på et tilbud |
| `invoice_id` | Hvis bogholder ringer om en ubetalt faktura |
| `lead_id` | Hvis sælger ringer på et lead før det er blevet kunde |
| `created_by` | Hvilken medarbejder der registrerede opkaldet (= den der ringede) |
| `next_action_id` | Hvis opkaldet resulterede i ny task/aftale, peger her — gør det muligt at se hele kæden |

### 2.3 Bevidst NIET inkluderet (kommer senere)

| Felt | Senere sprint |
|---|---|
| `recording_url` | 8C-3+ — kræver VoIP-integration + samtykke-flow (DK lov) |
| `transcript` | 8C-4 — kræver Whisper/AI-transkription |
| `voip_call_id` | 8C-3 — kun relevant ved auto-detect |
| `tags TEXT[]` | Kan tilføjes senere uden at bryde noget |

---

## 3. UI-flow (ingen kode endnu — design)

### 3.1 Mobil-flow (primær use case — Henrik på vejen)

```
┌─────────────────────────────────────────────┐
│  [Task: Skift HFI-relæ — Jens Jensen]       │
│                                             │
│  Kunde: Lars Hansen                         │
│  📞 ✉️ 📍                                    │
└─────────────────────────────────────────────┘
              ↓ klik 📞
┌─────────────────────────────────────────────┐
│  Telefon-app åbner: ringer 12 34 56 78      │
└─────────────────────────────────────────────┘
              ↓ samtale (1-30 min)
              ↓ Henrik vender tilbage til CRM
┌─────────────────────────────────────────────┐
│  Overlay venter:                            │
│  "Du ringede til Lars (Jensen) for 4 min siden"│
│                                             │
│  ☐ Tilføj opkaldsnotat                      │
│  ☐ Spring over (mark som 'no answer')       │
└─────────────────────────────────────────────┘
              ↓ klik Tilføj
┌─────────────────────────────────────────────┐
│  📝 Opkaldsnotat                            │
│                                             │
│  Resultat: ▼ Gennemført / Voicemail /       │
│              Ingen svar / Ringer tilbage    │
│                                             │
│  Hvad blev aftalt? (kort tekst)             │
│  [_____________________________________]    │
│                                             │
│  Næste skridt:                              │
│  ⚪ Ingen                                    │
│  ⚪ Opret opfølgnings-task   →             │
│  ⚪ Book aftale i kalenderen →             │
│                                             │
│  [Annuller]               [Gem notat]      │
└─────────────────────────────────────────────┘
              ↓ Gem
        call_notes row INSERT
        Optional: customer_tasks INSERT (next_action)
        Toast: "Notat gemt"
```

### 3.2 Desktop-flow

Identisk, men i stedet for tel: åbnes notat-dialogen direkte (eller efter
brugerens valg af "Ringer nu fra mobil/headset/Outlook"). Useful for
sælgere der ringer fra computer-VoIP eller blot vil logge et eksternt opkald.

### 3.3 Hvor ses notatet bagefter

| Sted | Indhold |
|---|---|
| **Kunde-detalje → Tab "Kommunikation"** | Alle opkald med kunden, sammen med mails (8C-1) |
| **Task-detalje** | Opkald knyttet til denne task |
| **Sag-detalje** | Opkald knyttet til denne service-case |
| **Tilbud → Aktivitet** | Opfølgnings-opkald på tilbud |
| **Min dag** (montør) | Egne opkald i dag |

---

## 4. `v_communication_log` — fælles timeline (DB VIEW, ikke ny tabel)

### 4.1 Hvorfor en VIEW i stedet for en kanonisk tabel?

- Mails ligger i `email_messages`
- SMS i `sms_messages`
- Portal-beskeder i `portal_messages`
- Opkald i (kommende) `call_notes`

I stedet for at sammenflette dem i en ny tabel (som ville duplikere data
+ kræve sync-logik), laver vi en read-only VIEW der UNION'er.

### 4.2 Forslag til VIEW (afventer approval — del af 8C-2A migration)

```sql
-- KRÆVER APPROVAL FØR KØRSEL
CREATE OR REPLACE VIEW v_communication_log AS
SELECT
  'email'::text AS kind,
  em.id::text AS source_id,
  em.thread_id::text AS thread_id,
  et.customer_id,
  CASE
    WHEN em.template_variables ? 'task_id'
    THEN (em.template_variables->>'task_id')::uuid
    ELSE NULL::uuid
  END AS task_id,
  et.offer_id,
  NULL::uuid AS service_case_id,
  NULL::uuid AS work_order_id,
  NULL::uuid AS invoice_id,
  em.direction,
  em.subject AS title,
  COALESCE(em.body_text, em.body_html) AS body,
  em.from_email AS from_address,
  em.to_email AS to_address,
  em.created_by AS actor_id,
  em.status,
  em.created_at AS occurred_at
FROM email_messages em
JOIN email_threads et ON et.id = em.thread_id

UNION ALL

SELECT
  'sms'::text AS kind,
  sm.id::text AS source_id,
  NULL::text AS thread_id,
  sm.customer_id,
  NULL::uuid AS task_id,
  NULL::uuid AS offer_id,
  NULL::uuid AS service_case_id,
  NULL::uuid AS work_order_id,
  NULL::uuid AS invoice_id,
  sm.direction,
  COALESCE(LEFT(sm.body, 80), '(SMS)') AS title,
  sm.body AS body,
  sm.from_number AS from_address,
  sm.to_number AS to_address,
  sm.created_by AS actor_id,
  sm.status,
  sm.created_at AS occurred_at
FROM sms_messages sm

UNION ALL

SELECT
  'call'::text AS kind,
  cn.id::text AS source_id,
  NULL::text AS thread_id,
  cn.customer_id,
  cn.task_id,
  cn.offer_id,
  cn.service_case_id,
  cn.work_order_id,
  cn.invoice_id,
  cn.direction,
  COALESCE(cn.title, 'Opkald') AS title,
  cn.summary AS body,
  CASE WHEN cn.direction = 'outbound' THEN NULL ELSE cn.phone_number END AS from_address,
  CASE WHEN cn.direction = 'outbound' THEN cn.phone_number ELSE NULL END AS to_address,
  cn.created_by AS actor_id,
  cn.outcome AS status,
  cn.called_at AS occurred_at
FROM call_notes cn

UNION ALL

SELECT
  'portal_message'::text AS kind,
  pm.id::text AS source_id,
  NULL::text AS thread_id,
  pm.customer_id,
  NULL::uuid AS task_id,
  pm.offer_id,
  NULL::uuid AS service_case_id,
  NULL::uuid AS work_order_id,
  NULL::uuid AS invoice_id,
  CASE WHEN pm.from_role = 'customer' THEN 'inbound' ELSE 'outbound' END AS direction,
  COALESCE(LEFT(pm.message, 80), '(portal-besked)') AS title,
  pm.message AS body,
  NULL::text AS from_address,
  NULL::text AS to_address,
  pm.created_by AS actor_id,
  NULL::text AS status,
  pm.created_at AS occurred_at
FROM portal_messages pm;

GRANT SELECT ON v_communication_log TO authenticated;
GRANT SELECT ON v_communication_log TO service_role;
```

**OBS:** Schema for `sms_messages` og `portal_messages` skal verificeres
før denne VIEW køres. Kolonnenavne kan afvige.

### 4.3 Brug i UI

```typescript
// Eksempel — server action
export async function getCustomerCommunicationLog(customerId: string) {
  const { supabase } = await getAuthenticatedClient()
  const { data } = await supabase
    .from('v_communication_log')
    .select('*')
    .eq('customer_id', customerId)
    .order('occurred_at', { ascending: false })
    .limit(100)
  return data || []
}
```

Komponenten `<CommunicationTimeline customerId={...} />` renderer det med
ikon pr. kind (📧 ✉️ 📞 💬 portal).

---

## 5. RBAC — hvem må hvad

| Permission key | Admin | Serviceleder | Montør | Sælger | Bogholderi |
|---|---|---|---|---|---|
| `calls.log` (opret notat) | ✅ | ✅ | ✅ (kun egne tasks) | ✅ | ⛔ |
| `calls.view_own` | ✅ | ✅ | ✅ | ✅ | ⛔ |
| `calls.view_all` | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| `calls.edit_own` (rette eget notat) | ✅ | ✅ | ✅ (24h vindue) | ✅ (24h vindue) | ⛔ |
| `calls.delete` (kun audit/admin) | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |

**Begrundelse:**
- Bogholderi har normalt ikke brug for opkalds-historik — men hvis Henrik
  ønsker at de skal kunne se opkald om fakturaspørgsmål, kan vi flytte
  `view_all` til at inkludere `bogholderi`. Beslutning afventer.
- Montør kan kun se/oprette opkald på tasks tildelt egen profile.id (samme
  scope-pattern som Sprint 7E `getCaseScope`).
- 24-timers redigeringsvindue forhindrer brugere i at omskrive historik
  efterfølgende. Efter 24h er notatet immutable (auditerbart).

---

## 6. GDPR-risikoanalyse

### 6.1 Personlige data

`call_notes` indeholder:
- Telefonnummer (PII)
- Kontakt-navn (PII)
- Resumé af samtale (potentielt sensitive PII — fx kunde der diskuterer
  sygdom, økonomi, familieforhold)

### 6.2 Mitigations

| Risk | Mitigation |
|---|---|
| **Sletning på kundens forespørgsel** | `deleteCustomerCompletely()` skal cascade til `call_notes` (allerede via `ON DELETE SET NULL` for customer_id, men også slette rowen helt hvis customer_id er FK'en) |
| **Notater om irrelevante personer** | Brugere instrueres i at notere FAKTA, ikke spekulationer. Trænings-tooltip i dialog |
| **Eksport ved kundeforespørgsel** | `getCommunicationLogForExport(customerId)` returnerer JSON for fuld GDPR-eksport |
| **Audit ved sletning** | Sletning logges i `audit_log` (sprint 7B) med slettet-af + tidspunkt |
| **Retention-policy** | Opkalds-notater ældre end 5 år bør anonymiseres (kontaktnavn → 'Anonymiseret'). Kommer i fremtidig sprint |
| **Adgangskontrol** | RLS + scope-filter — montør ser kun egne opkald, ikke kollegers |
| **Tredjeparts-deling** | Notater må aldrig forlade systemet automatisk. Kun manuel eksport via admin |

### 6.3 Bevidste GDPR-fordele

- Bedre dokumentation = lettere at svare på kundens spørgsmål om "hvad
  blev der aftalt"
- Audit-trail når montøren kan fortælle "vi aftalte i opkald 3. marts at..."
- Kollegial overlevering ved sygdom

---

## 7. Acceptkriterier for 8C-2

### 7.1 Funktionelle krav

- [ ] Henrik klikker Ring-knappen på en task → tel:-handler åbner mobiloperativsystem
- [ ] Efter samtale: overlay mountes med "Tilføj opkaldsnotat"
- [ ] Overlay kan også triggers manuelt fra task / customer / case (uden at have ringet først)
- [ ] Form har: resultat-dropdown, resumé, varighed (valgfri), næste action
- [ ] "Næste action: Opret task" → ny customer_task oprettes med link til notatet
- [ ] Notat synligt på kunde-detalje under "Kommunikation"-tab
- [ ] Notat synligt på task-detalje
- [ ] Notat synligt på service-case detalje
- [ ] Montør ser KUN egne opkald (scope via case-scope helper)
- [ ] Admin/serviceleder ser ALLE opkald
- [ ] Brugere kan rette egne notater i 24 timer; derefter immutable
- [ ] Brugere kan IKKE slette notater (kun admin)

### 7.2 Tekniske krav

- [ ] Migration 00109 (eller næste fri nummer) opretter `call_notes`-tabel
- [ ] RLS-policies aktiveret
- [ ] Indexes på FK-kolonner
- [ ] `v_communication_log` VIEW dækker call_notes
- [ ] Server-actions har `getAuthenticatedClientWithRole()` + permission-check
- [ ] Type-safe via `src/types/call-notes.types.ts`
- [ ] Browser-test guide inkluderer mobil + desktop

### 7.3 UI/UX-krav

- [ ] Mobil: overlay fylder hele skærmen, store touch-targets
- [ ] Desktop: dialog midt på skærmen, max-width 600px
- [ ] Form har autosave til localStorage hver 5 sek (undgå tab-loss)
- [ ] Toast feedback ved success/error
- [ ] Escape lukker dialog (efter bekræftelse hvis ulagrede ændringer)

---

## 8. Sprint-opdeling

### 8C-2A — Schema (1-2 dage)

**Leverancer:**
- Migration 00109_call_notes.sql (afventer Henriks SQL-approval)
- TypeScript-typer i `src/types/call-notes.types.ts`
- Permissions i `src/lib/auth/permissions.ts`: `calls.log`, `calls.view_own`,
  `calls.view_all`, `calls.edit_own`, `calls.delete`
- Server-actions i `src/lib/actions/call-notes.ts`:
  - `createCallNote(input)`
  - `updateCallNote(id, input)` (med 24h-vindue)
  - `deleteCallNote(id)` (admin-only)
  - `getCallNotesForCustomer(customerId)`
  - `getCallNotesForTask(taskId)`
  - `getCallNotesForCase(caseId)`
- (Senere) `v_communication_log` VIEW

**Stop-punkt:** Henrik godkender SQL før migration.

### 8C-2B — UI/Dialog (2-3 dage)

**Leverancer:**
- `<AddCallNoteDialog>` komponent (mobile-first responsive)
- "Tilføj opkaldsnotat"-knap mountes:
  - I task-row's quick-actions (efter Ring-knap)
  - På customer-detalje-side
  - På service-case detalje-side
  - På work-order detalje-side
- Auto-mount af dialog efter Ring-klik (med 2-sek delay på mobil)
- Form: resumé, resultat-dropdown, varighed, næste action
- "Næste action: opret task" → integration med eksisterende `createCustomerTask`
- localStorage autosave for ulagrede notater

### 8C-2C — Communication Timeline (2-3 dage)

**Leverancer:**
- `<CommunicationTimeline>` komponent — viser data fra `v_communication_log`
- Mountes som tab på:
  - `/dashboard/customers/[id]` → "Kommunikation"
  - `/dashboard/service-cases/[id]` → "Aktivitet"
  - `/dashboard/tasks/[id]` (hvis task-detail-side eksisterer; ellers udsat)
  - `/dashboard/offers/[id]` → "Aktivitet" (udvid eksisterende)
- Filter: kind (mail/sms/call/portal), retning, dato-interval
- Pagination (50 pr. side)
- Klik på row → ekspander detail (mail-body / opkalds-resumé / sms-tekst)

### 8C-2D — Mobile polish (1-2 dage)

**Leverancer:**
- Stort touch-friendly UI på mobil (min 44px touch-targets)
- Autosave af form-state ved tab-skift (undgå at miste notat ved app-skift)
- Pull-to-refresh på timeline
- Offline-fallback: opkald logges lokalt og syncer ved netværk
  (kun lille queue, ikke fuld offline-mode)
- iOS Safari + Android Chrome verifikation

---

## 9. Risici og åbne spørgsmål

### 9.1 Klart at adressere FØR start

1. **Beslutning: Skal bogholderi se opkalds-historik?**
   - Argument FOR: ved kreditor-spørgsmål kan se hvad kunden har lovet
   - Argument MOD: privacy — opkald om sygdom, problemer er ikke deres område
   - **Anbefaling:** START med 'view_all' = NEJ for bogholderi. Kan udvides
     senere uden migration.

2. **Beslutning: 24-timers edit-vindue**
   - Alternativ: ubegrænset edit, eller 7 dage
   - **Anbefaling:** 24t balancerer "fix typo" med "ingen historik-omskrivning"

3. **Beslutning: Skal opkald uden customer_id være tilladt?**
   - Use case: ukendt opkald hvor brugeren ikke kan finde kunden i CRM
   - **Anbefaling:** JA — `customer_id NULL`, skal manuelt linkes senere.
     Det er bedre at logge end at miste opkaldet.

### 9.2 Out of scope (eksplicit)

- VoIP-integration (3CX, Aircall, Twilio)
- Auto-detect af missed/inbound opkald
- Opkalds-optagelse + transkription
- AI-summary af notater
- Multi-line CRM (single-tenant)

---

## 10. Estimat

| Sprint | Dage |
|---|---|
| 8C-2A Schema | 1-2 |
| 8C-2B UI/Dialog | 2-3 |
| 8C-2C Timeline | 2-3 |
| 8C-2D Mobile polish | 1-2 |
| **Total** | **6-10 dage** |

---

## 11. Afhængigheder

### 11.1 Skal være klart FØR 8C-2 starter

- Sprint 8C-1 deployet og verificeret (✅ commit `464f99f`)
- Henriks SQL-approval på migration 00109 (afventer)
- Verifikation af `sms_messages` og `portal_messages` schema (afventer
  inspektion under 8C-2A)
- Beslutning på de 3 åbne spørgsmål i §9.1

### 11.2 Kan kører parallelt

- 8C-2C (Timeline UI) kan udvikles parallelt med 8C-2B hvis VIEW er klar
- 8C-2D (Mobile polish) kan udvikles løbende

### 11.3 Blokerer fremtidige sprints

8C-2 blokerer:
- 8C-3 (Indbakke-import multi-mailbox) — behøver `v_communication_log` for
  at vise indkommende mails i timeline
- 8C-4 (AI ordre-mail → arbejdsbeskrivelse) — behøver call_notes for at
  knytte AI-genererede tasks til relevante opkald

---

## 12. Næste skridt — beslutninger Henrik skal tage før kode

1. ✋ **Godkend / ændr SQL** for `call_notes`-tabel (§2.1)
2. ✋ **Godkend / ændr RBAC-matrix** (§5)
3. ✋ **Beslut bogholderi-adgang** (§9.1.1)
4. ✋ **Beslut edit-vindue** (§9.1.2)
5. ✋ **Beslut tom customer_id** (§9.1.3)

Når alle 5 er besluttet → 8C-2A schema-migration kan vises og køres efter
approval.

---

**Status:** Plan-only. Ingen kode skrevet. Ingen migration kørt. Afventer
Henriks beslutninger på 5 punkter ovenfor.
