# First real employee pilot: Henrik's checklist (2026-10-30)

The pilot runs around **one ready employee (P5, montør)**. `MONTOR_START_JOB_ENABLED` stays **OFF**: the job stays "Planlagt" until the montør presses **Afslut arbejdsordren**. Pressing "Start" is not needed for any step. No fake prod data is created. The case and work order are real work that the office plans as usual.

## 0. Status before the pilot (prod, read-only 2026-10-29)

| | Role | Status | What is missing |
|---|---|---|---|
| P1, P2 | admin | READY | (office, logs no hours) |
| P3 | admin | **BLOCKED_DATA** | Sale rate and cost rate are missing, so time registration is refused |
| P4 | montør | **BLOCKED_DATA** | Login exists but there is no employee record, so P4 cannot receive jobs or register time |
| P5 | montør | **READY** | Login, employee record, rates, 3 open work orders |

Nothing has been set or linked automatically. **Recheck (one command, read-only, prints only labels):**

```bash
npx tsx scripts/prod-pilot-readiness.ts
```

Exit 0 = no blockers. Exit 2 = the table shows what is still missing.

## 1. Fix P3 (missing rates): Henrik does it in the UI
1. **Medarbejdere** in the menu (`/dashboard/employees`), then click P3's row and **Rediger medarbejder**.
2. Open the **Løn og satser** fold. Under **Grundsatser** fill in:
   - **Salgspris / time** (becomes the employee's hourly rate on time registration);
   - **Intern kostpris / time** (becomes the cost price).
3. Optionally fill in **Begrundelse for ændring** (saved in the history), then **Gem satser**.
4. Run the recheck. P3 should show `timepris ja · kostpris ja`.

The values are Henrik's to decide. The system suggests nothing and sets nothing.

## 2. Fix P4 (no employee record): Henrik does it in the UI
P4 already has a login (a montør profile) but no employee record. Create the record and link the existing login to it. **Do not create a new login.**
1. **Medarbejdere**, then **+ Opret medarbejder** (`/dashboard/employees/new`). Fill in first name, last name, e-mail and role Montør, then save.
2. On the new employee, choose **Rediger medarbejder** and go to the **Login & adgang** panel.
3. In **Knyt eksisterende**, pick P4's user in **Vælg bruger…**, then click **Knyt**.
   - Only users without an employee record are shown.
   - Do **not** use "Inviter bruger": it creates a new login.
4. Under **Løn og satser**, set **Salgspris / time** and **Intern kostpris / time** (as for P3), then **Gem satser**.
5. Run the recheck. P4 should show `medarbejderrække ja`, rates `ja`, blocker `ingen`.

P4 can then be assigned work orders. Before that, P4 sees an empty "Mine job" and cannot register time, which is correct.

## 3. Office preparation (before the pilot day)
- [ ] A real case with a customer, address and description. Photos/documents attached if the job needs them.
- [ ] A work order on the case **assigned to P5**, with today's date (the case's **Planlægning / Timer** tab, then "Ny arbejdsordre", employee = P5).
- [ ] Optional: a task on the case for P5 (the **Opgaver** tab).
- [ ] P5 has a working login on their phone (try logging in once). Run the recheck the same day.
- [ ] Office person (operator) has the case open on a PC, with this checklist.

## 4. Pilot operator checklist (while the employee works, mobile first)
Tick off as the montør goes. The column "Expected" is what the montør should see; "If not" is what you note down.

| # | Step (montør on phone) | Expected | If not |
|---|---|---|---|
| 1 | Log in → lands on **Mine job** | Today's job is shown with the customer name, address and status "Planlagt" | "Kunne ikke hente dine job lige nu" = read error (not "no jobs"). Note the time and try "Prøv igen" |
| 2 | **Navigér** on the job | Google Maps opens with the right address | Wrong address: check the case/delivery address |
| 3 | Tap the job → the case opens | Case page without horizontal scroll; no amounts (the montør sees hours, not money) | Amounts visible = stop, report |
| 4 | Customer/case: the customer link opens | Customer page with contact/phone | "Siden blev ikke fundet" on *their own* customer = report |
| 5 | Description: **Overblik** | Case description and warnings are shown | |
| 6 | Photos/documents: **Dokumenter** / **Dokumentation** → "Tilføj foto / dokument" | Photo taken on the phone is uploaded and shown | A red box with "Prøv igen" = read error, not "no documents" |
| 7 | Hours: **Planlægning / Timer** → "Registrér timer" on *their own* work order | The hours are saved, shown under the work order, status "afventer godkendelse" | "mangler timepris/kostpris" = data error (see §1). Note other errors verbatim |
| 8 | Materials: **Materialer** → "Tilføj materiale" | Material added; **no purchase/sales price** shown to the montør | Price visible = stop, report |
| 9 | Task: **Opgaver** (or Mine job → tasks) | The montør's task is shown and can be marked as done | |
| 10 | Completion/handover: **Aflevering** → checklist + photos + customer signature | Signature saved | |
| 11 | **Afslut arbejdsordren** | The work order moves to "Afsluttet" (without "Start", flag OFF) | "Afsluttet uden timer — registrér din tid" in Mine job = hours missing |
| 12 | Back on Mine job | The job has moved to completed; "Mine timer" shows today's hours | Red box "Det betyder ikke, at du har 0 timer" = read error, not 0 |

**Office afterwards (operator):**
- [ ] **Godkend timer** (`/dashboard/time-approval`): approve P5's hours. Only admin/serviceleder can do this; the montør cannot approve their own hours.
- [ ] The case's billing status shows the hours and material, ready for the invoice draft. Do **not** send the invoice as part of the pilot unless that is the plan anyway.
- [ ] Write down: time per step, anything confusing, and every error message verbatim.

**Stop criteria (end the pilot and report):**
- the montør sees prices or amounts;
- the montør sees another montør's job or customer;
- hours land on the wrong work order;
- a step shows "nothing" where there should be something, without a red error box.

## 5. What is NOT part of the pilot
- Start job (`MONTOR_START_JOB_ENABLED`): OFF.
- MAIL_AUTOLINK: OFF. Suggest mode is implemented and tested, but not activated. Proposal: [mail-autolink-suggest-activation-proposal.md](mail-autolink-suggest-activation-proposal.md).
- SMS/Relatel, e-conomic push and Telegram: unchanged (off).
- 00243 (time_logs DB rights): applied in PROD 2026-10-30 (standard roles unchanged, verified 35/35).
- Short version for the pilot day: [pilot-p5-operator-card.md](pilot-p5-operator-card.md). Post-session check: `npx tsx scripts/prod-pilot-session-check.ts`.
