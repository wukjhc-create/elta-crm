# Proposal: activate `MAIL_AUTOLINK_MODE=suggest` in prod (LATER, not now)

**Status 2026-10-30:** `MAIL_AUTOLINK_MODE` is `off` in prod (unset also means `off`). Code and tests are ready (K5 autolink-scenario 13/13, suggest 13/13, policy 12/12 on staging). **Nothing is activated.** This is a decision basis for Henrik. Activation requires his explicit approval.

## What changes
- **One env variable on Vercel (production):** `MAIL_AUTOLINK_MODE=suggest`. It takes effect on the next deploy or redeploy. No migration and no code change.
- **On every synced mail without a customer** (kontakt@ and ordre@ only, as today), K5 (`src/lib/services/email-autolink.ts`) computes a suggestion **before** the existing `linkEmail()`. `linkEmail()` then runs **unchanged**.
- **Users see no difference.**
  - `incoming_emails` is never touched by the suggestion; existing linking and the inbox behave exactly as today.
  - No mail, SMS or notification is sent.
- **Not affected:** FormSubmit web inquiries and internal senders (own domain); K5 never matches them on the sender.

## What is logged
One row in `audit_logs` per mail, at most once per mail (the duplicate check runs on `metadata.mode='suggest'`):
- **Fields:**
  - `action = 'email_link_suggested'`, `entity_type = 'incoming_email'`, `user_name = 'Mail-automatik'`;
  - `metadata`: `mode: 'suggest'`, `confidence` (high/medium/low), `would_auto_link` (true only for high confidence), `candidate_customer_ids`, `matched_on` (exact/contact/thread/domain) and `reason`.
- **Where it is visible:** only in **Indstillinger → Audit-log** (admin). It is not shown in any feed for other roles.
- **Volume:** at most one row per new unlinked mail. Mails that `linkEmail()` links are linked anyway; the suggestion is written before that and is still evaluated.

## How Henrik evaluates (after ~7 days)

```bash
npx tsx scripts/prod-autolink-suggest-eval.ts 7
```

It is read-only and prints only counts and percentages, no mails, subjects or addresses. Each suggestion is compared with the mail's **actual** link today:

| Outcome | Meaning |
|---|---|
| **enig** (agrees) | linked to the suggestion's only candidate |
| **uenig** (disagrees) | linked to **another** customer, the dangerous case |
| **blandt kandidater** | the actual customer was one of several candidates |
| **åben** (open) | the mail is still unlinked; the suggestion may have saved manual work |

**Criteria before `link` can even be proposed:**
- high confidence ("would link"): ≥ 98 % agreement and **0 disagreements** over at least ~50 decided suggestions;
- medium (domain only): only ever a suggestion, never an automatic link, even after `link`;
- every disagreement is reviewed manually: why did K5 pick another customer?

## Rollback / off switch
- Remove `MAIL_AUTOLINK_MODE` on Vercel or set it to `off`, then redeploy. It is off on the next mail sync.
- **No data to roll back:** the suggestion rows in `audit_logs` are harmless history. Do not delete them, because they are the evaluation basis.
- **Fail-safe:** an unknown value means `off`, and a suggestion error never affects the mail sync (try/catch; `linkEmail()` still runs).

## Not part of this proposal
- `link` mode, where K5 links on its own, requires a separate approval after the evaluation.
- Removing the legacy manual "Sync now" path.
- Any migration.
