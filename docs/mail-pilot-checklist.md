# Mail-modul — Pilot Checkliste

**Formål:** Operationel tjekliste til Henrik under pilot-perioden af mailmodulet.
Indeholder test-procedurer for de leverede flows, kendte gaps, og hvad der skal
holdes øje med.

**Sidste opdatering:** 2026-05-09 (Sprint 8C-3)

---

## 1. Sådan tester man "Sync nu"

1. Naviger til `/dashboard/mail`
2. Bemærk inline-status ved siden af knappen: *"Auto-sync • sidst {tid}"*
3. Klik **"Sync nu"**
4. Forventet adfærd:
   - Knappen viser spinner + "Synkroniserer..."
   - Toast efter ~1-3 sekunder:
     - Hvis nye mails: `"Sync fuldført — N nye (X.Xs)"` med per-mailbox detail
       (`ordre: 2 nye | kontakt: 0 nye`)
     - Hvis 0 nye: `"Ingen nye mails fundet (X.Xs)"` + sidste-sync-tid
   - Hvis nye mails kom ind: nyeste mail auto-vælges i højre panel
5. Hvis fejl pr. mailbox: rød banner med `mailbox: fejlmeddelelse`

### Auto-sync (passiv)

- Kører automatisk hvert **60. sek** mens `/dashboard/mail` er åben
- Stille drift — ingen toast på auto-sync
- Realtime subscription opdaterer listen instantanously når nye rows skrives
- Overlap-guard: manuel sync afviser hvis auto-sync er i gang (toast: "Sync allerede i gang")

### Test af security

- `curl -X POST https://elta-crm.vercel.app/api/email/sync` (uden auth) → forventet **401**
- Frontend "Sync nu" bruger ikke endpointet — den kalder server-action direkte

---

## 2. Sådan tester man signatur

### Outbound task-mail (8C-2 helper)

1. Gå til `/dashboard/tasks`
2. Find en task med kunde + email → klik blå **✉️ mail-ikon**
3. Skriv testmail og send
4. **Forventet i Outlook (modtager-side):**
   ```
   Med venlig hilsen,

   Henrik Christensen
   Firma: Elta Solar ApS  ← orange accent på firmanavn
   Telefon: 70 60 51 50
   Direkte: 61 10 75 30
   E-mail: hc@eltasolar.dk
   CVR: 45630897
   eltasolar.dk
   ```
   - Lodret 4px grøn streg til venstre
   - Logo udelades hvis `company_settings.company_logo_url` ikke er en valid `https://`-URL

### Outbound customer compose

1. Gå til `/dashboard/customers/[id]`
2. Skroll til CustomerEmailTimeline → klik **"Skriv ny mail"**
3. Send → samme signatur som ovenfor (efter commit `e3a3f5e`)

### Fail-fast

- Hvis signaturen mangler "CVR: 45630897" returnerer task-mail server-action
  fejlbesked og afviser send → mail bliver ALDRIG sendt med ufuldstændig signatur

---

## 3. Sådan tester man reply-threading

1. Send en testmail fra task-dialog (subject fx `[REPLY TEST] {timestamp}`)
2. Skift til kundens mailbox (Outlook test-postkasse)
3. Klik **Svar** på mailen → send svar
4. Vent 30-90 sek på auto-sync, eller klik manuelt "Sync nu"
5. **Forventet i CRM:**
   - Reply hentet til `incoming_emails`
   - `link_status = 'linked'` med `customer_id` sat
   - Reply har samme `conversation_id` som outbound mirror (Sprint 8C-1.1B)
6. **Verificering via SQL:**
   ```sql
   SELECT
     CASE WHEN sender_email LIKE '%@eltasolar.dk' AND sender_email = mailbox_source
          THEN 'OUTBOUND' ELSE 'INBOUND' END AS direction,
     subject, conversation_id, customer_id, link_status, received_at
   FROM incoming_emails
   WHERE subject ILIKE '%REPLY TEST%'
   ORDER BY received_at;
   ```
   Begge rows skal have **samme `conversation_id`** og samme `customer_id`.

---

## 4. Sådan kontrollerer man ignorerede mails

### Hvor finder man dem?

1. På `/dashboard/mail` klik tab **"Ignorerede"**
2. Liste viser alle mails med `link_status='ignored'`
3. Tjek at:
   - Marketing/social/system-mails ER her
   - Forretningsmails (faktura, tilbud, ordre, leverandører) IKKE er her

### Hvis kerneforretningsmail havner forkert i "Ignorerede"

1. Klik mailen → MailDetail åbner i højre panel
2. Klik **"Markér som relevant"** (amber-knap)
3. Mailen flyttes tilbage til `link_status='unidentified'` → vises i "Uidentificerede"-tab
4. Henrik kan derefter manuelt linke den til en kunde

### Rapportering af falske positiver

Send sender-email + subject til ChatGPT:
- Eksempel: `Sender: jens@noget-vigtigt.dk, Subject: Faktura #123` → tilføj domænet til `PROTECTED_DOMAINS`
- Eksempel: `Sender: noreply@stepstone.dk, Subject: Job alert` → bekræfter at filteret virker

### Beskyttede mønstre (markeres ALDRIG som støj)

**Domæner:** eltasolar.dk, ao.dk, lemu.dk, lemvigh-muller.dk, mikma.dk, fasetech.dk,
solarsupply.dk, cerius.dk, radius.dk, trefor.dk, n1.dk, energinet.dk,
huawei.com, sungrow.com, goodwe.com, fronius.com

**Subject/body keywords:** tilbud, faktura, kreditnota, betaling, ordrebekraeftelse,
ordrebekræftelse, reklamation, sag, sagsnummer, opgave, arbejdsseddel, service,
fejlmelding, solcelle, installation, batteri, inverter, ladestander,
el-installation, eltavle, måler

---

## 5. Kendte gaps (afventer pilot-feedback)

### Funktionelle gaps
- **Task-mail-historik:** task-mail soft-ref'es via `email_messages.template_variables.task_id`
  men har ingen UI på task-detail-siden. Mail-historik findes på kunde-detalje.
- **email_threads task_id-FK:** ingen hård FK til task — kun JSONB soft-ref
- **Andre mail-flows uden 8C-2 helper:** offer-email, invoice-email, portal-mails,
  service-cases-mail, besigtigelse, customer-tasks notif. Bruger egne templates med
  egen footer (CVR fixed via brand.ts efter `dffee21`)

### Performance gaps
- **Auto-sync:** kører kun mens `/dashboard/mail` er åben. Andre sider trigger ikke sync
- **Polling 60s:** real-time push (Graph webhook subscription) ikke implementeret
- **Auto-sync stopper ikke når tab er inaktiv** (Page Visibility API ikke koblet på)

### UI gaps
- **Ingen "Ny"-badge** på mails ankommet siden sidste view
- **Ingen "Skift til Mine sager"-flow** fra mail → opret service-case → linket task
- **Ingen tasks-mail-tab på task-detail** (afventer task-detail-side)

### Sikkerhed
- **Personlig OAuth pr. medarbejder ikke implementeret** — hele app bruger
  app-only Graph credentials mod fælles mailbokse (`ordre@`, `kontakt@`, evt. `hc@`)

---

## 6. Hvad Henrik skal holde øje med under pilot

### Verificér ugentligt
- `/dashboard/mail` "Ignorerede"-tab: ingen kerneforretningsmails er her ved en fejl
- `/dashboard/mail` "Uidentificerede"-tab: ingen kunde-mails er glemt at blive linket
- `graph_sync_state.last_sync_at`: alle mailbokse er synket indenfor sidste døgn
- `email_messages.status='failed'`: fejl-mails skal have et opfølgnings-spor

### Rapportér med det samme
- Mails der ikke kommer ind efter "Sync nu" + 2x retry
- Signaturer der mangler felter for andre brugere end Henrik (kræver
  USER_DEFAULTS-update i `src/lib/email/signature.ts` eller employee-data)
- Kunde-mails der havner forkert i "Ignorerede"-tab
- Threading-fejl: outbound og reply hver i sin tråd i CRM

### SQL-cheatsheets

**Find ignorerede mails fra sidste 24t (audit):**
```sql
SELECT subject, sender_email, mailbox_source, received_at
FROM incoming_emails
WHERE link_status = 'ignored'
  AND linked_by = 'auto-noise'
  AND received_at >= NOW() - INTERVAL '24 hours'
ORDER BY received_at DESC
LIMIT 50;
```

**Find sync-fejl pr. mailbox:**
```sql
SELECT mailbox, last_sync_at, last_sync_status, last_sync_error
FROM graph_sync_state
WHERE last_sync_status = 'failed' OR last_sync_error IS NOT NULL;
```

**Find outbound mails uden conversation_id (mulig regression):**
```sql
SELECT subject, sender_email, received_at
FROM incoming_emails
WHERE sender_email LIKE '%@eltasolar.dk'
  AND conversation_id IS NULL
  AND received_at >= NOW() - INTERVAL '7 days'
ORDER BY received_at DESC;
```

---

## 7. Eskalering

Ved kritiske mail-problemer i produktion:
1. Tjek Vercel-logs: `vercel logs` for sync-fejl
2. Trigger manuel sync: `curl -H "Authorization: Bearer $CRON_SECRET" -X POST .../api/email/sync`
3. Hvis Graph er nede: tjek https://status.office365.com
4. Henriks fallback: send fra Outlook direkte (mister CRM-historik for den mail —
   accepteres som nødløsning)

---

## 8. Reference til relaterede docs

- `SPRINT_8C_COMMUNICATION_HUB_ANALYSIS.md` — overordnet vision for kommunikations-modulet
- `SPRINT_8C_2_CALL_NOTES_AND_COMMUNICATION_TIMELINE_PLAN.md` — næste sprint (call_notes + timeline)
- `SPRINT_8C_1_5_REMAINING_MAILTO_AUDIT.md` — resterende mailto:-overflader der bør konverteres
