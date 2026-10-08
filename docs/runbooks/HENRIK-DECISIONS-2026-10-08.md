# Ventende Henrik-beslutninger (samlet 2026-10-08)

Alt herunder er forberedt og testet så langt det kan uden prod-skrivning. Intet er kørt i prod.
Kør altid pre → `npm run prod:apply-migration -- <nr> --approved-by-henrik` (efter allowlist) → post.

## Sikkerhed (S1/S2)
| # | Hvad | Status / hvad der mangler | Verificering |
|---|---|---|---|
| P1 | Selvregistrering i Supabase Auth er stadig slået TIL | Henrik slår "Allow new users to sign up" fra (docs/runbooks/supabase-disable-signup.md) | `npx tsx scripts/prod-auth-signup-status.ts` → `disable_signup: true` (2026-10-08: stadig `false`) |
| 00204 | `leads`/`lead_activities` læsbare for ALLE indloggede (USING true) + unikt indeks pr. kildemail | Udkast på branch `leads-00204-read-scope`. Appen gater allerede på leads.view | pre: `prod-leads-source-email-dupes.ts` (0 dubletter) + `prod-table-select-policies.ts leads lead_activities` |
| 00207 | `packages` (kostpris/DB pr. pakke) læsbar for alle indloggede via REST | Udkast på branch `packages-cost-00207`; appen er allerede klar (getPackages via admin-klient for salg) | `prod-table-select-policies.ts packages` før/efter |

## Økonomi
| # | Hvad | Status | Verificering |
|---|---|---|---|
| 00205 | `calculate_work_order_profit` tager omsætning fra seneste faktura uanset status (også kladde); satsskift på godkendte timer nulstiller ikke godkendelsen i DB | Udkast på branch `profit-rate-00205` (appen afviser allerede satsskift uden godkenderret) | diff mod 00202/00185: kun to betingelser |
| 00206 | `get_customer_product_price` ignorerer kunderabat når aftalen ikke har egen avance (`record IS NOT NULL`) | Udkast på branch `customer-price-00206` — LATENT: prod har 0 kundeaftaler (`prod-customer-price-agreements.ts`), lav hast | staging: `cli.ts customer-price-rpc-check` (uden avance 100 → efter rettelse 90) |
| 00203 Trin B | Aktivering af tilbudsrevisioner (`OFFER_REVISIONS_ENABLED`) | Klar — docs/runbooks/offer-revisions-activation.md (smoke 7/7) | `npx tsx scripts/prod-smoke-00203.ts` lige før |

## ELTA Assistant / Telegram (staging færdig, intet live)
| # | Hvad | Mangler |
|---|---|---|
| 00195–00197 | Telegram-kobling, kundenoter, personlige påmindelser | Prod-migrationer + `ASSISTANT_TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, setWebhook |
| T11 | Talebeskeder | + `ASSISTANT_VOICE_ENABLED=true` (bruger OPENAI_API_KEY + AI-dagsbudget) |
| T12 | Ubesvarede opkald → tilbageringning | Relatel access-token + live-klient + cron (kontrakt i lib/integrations/relatel) |
| T14 | Regelbaseret opfølgning | Valg af regler R1–R6 (docs/design/elta-assistant-telegram.md § T14) |

## Drift før pilot
| # | Hvad | Verificering |
|---|---|---|
| G11 | Montør #2 har login men ingen koblet medarbejder (2 logins, 1 koblet) | `npx tsx scripts/prod-montor-linkage.ts` |
| G12 | Bankoplysninger på fakturaer (Vercel `INVOICE_BANK_*` eller Indstillinger → Firma) | /dashboard/go-live "Opsætning før pilot" |

## Forretningsvalg (ingen kode blokeret)
- Portalbeskeder: må montør/bogholderi sende kundebeskeder? (i dag: alle med customers.view; offer-id valideres nu)
- Rykker-cron: højst 3 rykkermails pr. kørsel (dagligt) — hæves hvis mange forfaldne fakturaer
