# P5 pilot: operator card (Henrik)

**Who:** P5 (montør, READY). P3 and P4 stay out until Henrik has entered their data ([checklist §1–2](pilot-employee-checklist-2026-10-30.md)).
**Prod settings:** `MONTOR_START_JOB_ENABLED` = OFF (no "Start"; the job stays *Planlagt* until **✓ Afslut**). `MAIL_AUTOLINK_MODE` = off.

## Before (the day before or in the morning)

```bash
npx tsx scripts/prod-pilot-readiness.ts
```

- [ ] P5 shows `blokering: ingen`. P3 and P4 may still be red; that does not block P5.
- [ ] A real case with an address and description, and a work order for **today assigned to P5**. Optionally a task for P5 on the case.
- [ ] P5 has logged in once on their phone.

## During (P5 on the phone, you at the PC with the case open)

| # | P5 does | Note if |
|---|---|---|
| 1 | **Mine job**: today's job shows as *Planlagt* | the job is missing, or a red "Kunne ikke hente…" box |
| 2 | **Navigér** | the wrong address opens |
| 3 | Tap the job: the case opens | horizontal scroll, or **amounts/prices visible** → STOP (S1) |
| 4 | Customer link, **Overblik** (description) | "Siden blev ikke fundet" on P5's own case/customer → S2 |
| 5 | **Dokumenter**: add a photo | the upload fails or the photo is not shown |
| 6 | **Registrér timer** on P5's own work order | any error text: write it down **verbatim** |
| 7 | **Materialer**: add material | **price visible** → STOP (S1); it lands on the wrong case → S2 |
| 8 | **Opgaver**: mark the task as done | an error, or the task is not shown |
| 9 | **Aflevering**: checklist, photos, customer signature | the signature is not saved |
| 10 | **✓ Afslut** the work order | the job does not move to *Afsluttet* |
| 11 | **Mine timer** shows today's hours | 0 hours without a red error box → S2 |

For each problem, write down the time, the step number, the error text verbatim, and **slow** (> ~5 s) or **confusing** if so. No customer names are needed.

## After (and between sessions)

```bash
npx tsx scripts/prod-pilot-session-check.ts --hours 12
```

It is read-only and shows no customer names, amounts or free text.

- **What was used:** activity per person (hours, completed work orders, materials, documents, handover photos, tasks).
- **Failed actions and permission denials:** every failed save in the pilot flow, with the error text and its class.
- **Client crashes, orphaned hours, hours on the wrong work order, materials on the wrong case:** checked in the same run.
- **Document/photo errors, task errors, incomplete handovers, employee/rate problems:** checked in the same run.
- **Exit codes:** 0 = nothing; 2 = findings (❌). P3 and P4 appear under employee/rate problems until they are fixed.

Then approve P5's hours in **Godkend timer** (`/dashboard/time-approval`). Do not send an invoice as part of the pilot.

## Stop / classification ([incident flow](pilot-incident-flow.md))
| Class | Example | Action |
|---|---|---|
| **S1** | P5 sees prices, amounts or another montør's job; data lost; double registration | Stop that step immediately and report |
| **S2** | Hours or material on the wrong case/work order; a core step impossible; wrong permission | Fix before the next session (code-only fixes are made autonomously) |
| **S3** | Annoying but usable (extra click, unclear text, slow) | Backlog, the pilot continues |
| Cosmetic | Layout/wording | Deferred |

Any DB migration or live activation still needs your approval.
