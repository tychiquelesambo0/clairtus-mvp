# Clairtus WhatsApp Bot - Master End-to-End Test Guide

## 1) Purpose

Use this as the single QA playbook to validate:

- every user-facing message path
- every transaction state transition
- every major failure mode and recovery mode
- all critical security and idempotency behaviors

Run this guide before production releases and after any copy/logic changes.

---

## 2) Test Scope

This guide covers these live bot surfaces:

- WhatsApp webhook routing (`text`, `interactive button`, fallback)
- State machine transitions (`INITIATED` -> `PENDING_FUNDING` -> `SECURED` -> `COMPLETED`)
- Failure states (`CANCELLED`, `PIN_FAILED_LOCKED`, `PAYOUT_FAILED`, `PAYOUT_DELAYED`)
- PawaPay deposit/payout/refund integration and webhook handling
- Cron jobs (deposit timeout, TTL enforcement, payout retry/escalation)
- Abuse controls (rate limit, suspension, human support halt)
- Transaction list/detail experience (`MES TRANSACTIONS`, `DETAIL`, references)

---

## 3) Test Environment Setup

## 3.1 Required Secrets / Config

Verify these are set in your target Supabase project:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `PAWAPAY_API_KEY`
- `PAWAPAY_API_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `WHATSAPP_TRANSACTION_ALERT_TEMPLATE_NAME=transaction_notify_v1`
- `WHATSAPP_TRANSACTION_ALERT_TEMPLATE_LANG=fr`

## 3.2 Runtime Flags (recommended QA defaults)

- `AUTO_MARK_PAYMENT_SECURED=false` (realistic payout/deposit flow)
- `ALLOW_NON_DRC_TEST_NUMBERS=false` (unless you deliberately test non-DRC)

Use `AUTO_MARK_PAYMENT_SECURED=true` only for dedicated test-mode cases.

## 3.3 Limits Baseline (mandatory before UAT)

Prepare and freeze a `limits baseline` table signed by Ops/Compliance before execution:

- BCC fee-inclusive debit cap per transaction (USD).
- MNO-specific collection/payout caps by operator profile.
- Derived maximum `base_amount` allowed by parser for each profile.
- MNO fee assumption used in cap math (current MVP default: `1.5%`).

Enforcement rule for pass/fail:

- bot logic must enforce the `lowest effective cap` among internal rules, BCC cap, and selected MNO cap.

## 3.4 Test Personas

Prepare at least these numbers:

- Seller A: clean account
- Buyer A: clean account
- Seller B: for lock/suspension tests
- Buyer B: for timeout/edge scenarios
- Intruder C: not party of transaction (authorization tests)

All numbers must be E.164 (`+243...`) in your test data.

---

## 4) Observability Checklist (for every scenario)

After each test, check:

- `transactions`: status, parties, amounts, `requires_human`, PawaPay IDs
- `transaction_status_log`: expected event sequence
- `error_logs`: expected error type for failure scenarios
- `users`: `successful_transactions`, `cancelled_transactions`, `is_suspended`

Minimum pass condition: user-visible result + DB state + audit log all match.

---

## 5) Command/Intent Matrix (User Input Coverage)

Test each command at least once:

- greeting: `BONJOUR`, `SALUT`, `BONSOIR`
- guided mode: `VENDRE`, `ACHETER`
- free-form create:
  - `Vente [Montant] USD [Article] au +243...`
  - `Achat [Montant] USD [Article] au +243...`
- action commands:
  - `ACCEPTER [uuid]`, `REFUSER [uuid]`, `AIDE [uuid]`, `ANNULER [uuid?]`
- support synonyms: `AIDE`, `HELP`, `SUPPORT`
- PIN submit: any `4` digits when seller is on `SECURED`
- history: `MES TRANSACTIONS`, `HISTORIQUE`, `EN COURS`
- detail: `DETAIL CLT-XXXXXX`, `STATUT CLT-XXXXXX`, bare `CLT-XXXXXX`
- reset/restart in guided flow: `MENU`, `STOP`, `ANNULER`, `BONJOUR`

---

## 6) Full Scenario Suite

Use these IDs in your QA notes.

## A. Onboarding + Guided Conversation

### TC-A1 New identity capture

1. New user sends `BONJOUR`.
2. Bot asks first name, then last name.
3. Complete both.

Expected:

- `users.first_name/last_name` saved
- guided entry menu sent (sell/buy)
- no transaction created yet

### TC-A2 Identity invalid format

1. Send invalid name (`1234`, symbols).

Expected:

- validation rejection message
- identity draft remains active

### TC-A3 Resume pending action after identity

1. New user sends actionable command before identity complete (e.g., `ACCEPTER ...`).
2. Finish identity prompts.

Expected:

- pending action is resumed automatically
- user gets "we resume where you stopped" style message

## B. Transaction Creation + Validation

### TC-B1 Guided creation happy path

1. `BONJOUR` -> `VENDRE`
2. enter item
3. enter amount
4. enter counterparty phone

Expected:

- bot generates synthetic `Vente ... USD ... au +243...`
- transaction inserted with `INITIATED`
- template/interactive/text dispatch attempts logged in response path

### TC-B2 Free-form creation happy path

1. Send valid `Vente ...` message directly.

Expected:

- same as TC-B1

### TC-B3 Amount boundaries (critical)

Test:

- `0.99` (reject)
- `1.00` (accept)
- exact effective max `base_amount` for active baseline profile (accept)
- effective max `base_amount + 0.01` (reject)
- reference example when fee-inclusive cap is `2500` and MNO fee is `1.5%`:
  - `2463.05` accept
  - `2463.06` reject

Expected:

- reject message references cap with fees included
- accepted amounts produce valid transaction
- accepted case produces buyer total debit `<=` effective cap

### TC-B4 Currency validation

1. `Vente 100 EUR ...`

Expected:

- USD-only rejection

### TC-B5 Phone validation

1. invalid phone formats
2. same seller and buyer phone

Expected:

- strict rejection with helpful guidance

### TC-B6 Rate limit 5/hour

1. Create 5 valid transactions in <1h.
2. Attempt 6th.

Expected:

- 6th blocked with limit message

### TC-B7 Suspended user creation block

1. Set user suspended (admin/state-machine).
2. Try create transaction.

Expected:

- immediate suspension block

## C. Initiation Response Paths

### TC-C1 Counterparty ACCEPT

1. Buyer taps `ACCEPTER` button (or sends `ACCEPTER <uuid>`).

Expected:

- `INITIATED -> PENDING_FUNDING`
- status log event: `COUNTERPARTY_ACCEPT`
- deposit initiation attempted

### TC-C2 Counterparty REFUSE

1. Buyer taps `REFUSER`.

Expected:

- `INITIATED -> CANCELLED`
- seller notified

### TC-C3 Human support request

1. Send `AIDE` during active transaction.

Expected:

- `requires_human=true`
- automation halts for further automatic transitions
- admin alert entry in `error_logs`

### TC-C4 Unauthorized actor

1. Intruder C tries action on someone else's transaction.

Expected:

- action denied
- no transition

## D. Funding Stage + Deposit Outcomes

### TC-D1 Deposit success webhook

1. Transaction in `PENDING_FUNDING`.
2. Send signed pawaPay deposit success webhook.

Expected:

- `PENDING_FUNDING -> SECURED`
- PIN generated/stored
- buyer + seller secured notifications

### TC-D2 Deposit failed webhook

1. Send signed deposit failed/cancelled webhook.

Expected:

- moves to `CANCELLED` (if still pending)
- both users notified

### TC-D3 Deposit timeout cron (30 min)

1. Keep transaction in `PENDING_FUNDING` >30 min.
2. Run `cron-jobs/deposit-timeout`.

Expected:

- status to `CANCELLED`
- `DEPOSIT_TIMEOUT` event logged
- both users timeout-notified

### TC-D4 Operator limit messaging

1. Trigger deposit initiation failure with limit-like error body.

Expected:

- user gets calm recovery copy with `RÉESSAYER`
- no scary technical wording

### TC-D5 Fee-inclusive cap integrity

1. For each baseline operator profile, run creation then deposit initiation at:
   - max allowed `base_amount`
   - max+0.01

Expected:

- max allowed amount proceeds to funding/deposit request
- max+0.01 is rejected before charge attempt
- computed buyer debit (`base + mno_fee`) never exceeds effective cap

## E. SECURED Stage + PIN

### TC-E1 PIN success -> payout trigger

1. Seller sends correct 4-digit PIN.

Expected:

- PIN validated
- payout initiation called (or auto-complete if test mode on)

### TC-E2 Wrong PIN attempts 1-2

1. Submit wrong PIN twice.

Expected:

- attempts incremented
- still `SECURED`

### TC-E3 Third wrong PIN

1. Third wrong PIN.

Expected:

- `SECURED -> PIN_FAILED_LOCKED`
- `requires_human=true`
- buyer/vendor lock notifications

### TC-E4 Auto-suspension threshold

1. Make same seller hit `PIN_FAILED_LOCKED` on 3 separate transactions.

Expected:

- seller becomes suspended
- future creation attempts blocked

## F. Payout Outcomes + Retry

### TC-F1 Payout success webhook

1. Send signed payout success webhook.

Expected:

- to `COMPLETED`
- increments both users' success counters
- completion notifications sent

### TC-F2 Receiver limit exceeded

1. Simulate payout error scenario `RECEIVER_LIMIT_EXCEEDED`.

Expected:

- `-> PAYOUT_FAILED`
- retry button flow available (`RÉESSAYER`)
- calm, actionable copy

### TC-F6 Operator-specific payout caps

1. Repeat payout tests for each enabled MNO profile in limits baseline.

Expected:

- limit-induced failures map deterministically to `PAYOUT_FAILED`
- retry path remains idempotent (no double payout)
- successful retries transition to `COMPLETED`

### TC-F3 Network timeout/503

1. Simulate payout timeout scenario.

Expected:

- `-> PAYOUT_DELAYED`
- reassurance message to seller

### TC-F4 Manual retry action

1. Seller taps `RÉESSAYER` on delayed/failed payout.

Expected:

- payout re-initiated
- same transaction UUID used as idempotency key

### TC-F5 Retry cron + escalation

1. Put transaction in `PAYOUT_DELAYED`.
2. Run `cron-jobs/payout-retry`.
3. Keep delayed >24h then run again.

Expected:

- retries while under threshold
- after threshold: `requires_human=true` escalation
- admin alert log created

## G. Cancellation + TTL + Refund

### TC-G1 User cancel allowed window

1. Cancel while `INITIATED` and `PENDING_FUNDING`.

Expected:

- transition to `CANCELLED`

### TC-G2 Cancel blocked after funding

1. Try cancel from `SECURED` and beyond.

Expected:

- cancellation blocked with clear message

### TC-G3 INITIATED TTL expiry (24h)

1. Expire INITIATED transaction.
2. Run `cron-jobs/ttl-enforcement`.

Expected:

- auto-cancel with TTL log event

### TC-G4 SECURED TTL expiry (72h)

1. Expire SECURED transaction.
2. Run `cron-jobs/ttl-enforcement`.

Expected:

- refund initiated (base amount only)
- `SECURED -> CANCELLED`
- seller `cancelled_transactions` incremented
- buyer/seller TTL-specific notifications

### TC-G5 Refund webhook success

1. Send signed refund success webhook.

Expected:

- final status remains/sets `CANCELLED`
- refund IDs/logs consistent

## H. Listing, References, Contextual Fallbacks

### TC-H1 Transaction list

1. `MES TRANSACTIONS`

Expected:

- up to 5 recent transactions with `CLT-` references and status labels

### TC-H2 Detail by reference

1. `DETAIL CLT-XXXXXX`

Expected:

- detail card with role, counterparty, amount, status, next action hint

### TC-H3 Invalid reference help

1. malformed `CLT` reference.

Expected:

- format guidance returned

### TC-H4 Unknown message in each major status

Test unknown text when user has latest status:

- none
- `INITIATED`
- `PENDING_FUNDING`
- `SECURED`
- `PAYOUT_FAILED`
- `PAYOUT_DELAYED`
- `PIN_FAILED_LOCKED`
- `COMPLETED`

Expected:

- role/state-aware fallback response (not generic dead-end)

## I. Security + Idempotency

### TC-I1 WhatsApp signature required

1. POST webhook without signature or with invalid signature.

Expected:

- `401 Unauthorized`
- signature failure logged

### TC-I2 pawaPay signature required

1. POST pawaPay webhook with invalid signature.

Expected:

- `401 Unauthorized`

### TC-I3 Duplicate webhook replay

1. Replay same valid deposit/payout/refund webhook payload.

Expected:

- no double transition
- no double counters
- idempotent/log-safe behavior

### TC-I4 Idempotency key invariant

Inspect logs/requests for repeated calls.

Expected:

- idempotency key always transaction UUID

## J. Admin-Driven Recovery

### TC-J1 Force payout/refund from admin panel

Expected:

- only allowed from valid states
- transitions and logs consistent

### TC-J2 Resume automation

1. On `requires_human=true`, resume via admin action.

Expected:

- `requires_human=false`
- automation resumes on next valid trigger

---

## 7) Fast Automation Path (API-level)

Use existing script:

- `supabase/tests/mvp_preview_flow.sh`

It validates baseline chain:

1. `create_transaction`
2. simulated WhatsApp `ACCEPTER`
3. simulated deposit webhook success
4. simulated payout webhook success
5. final DB snapshot

Use this script as smoke test before running manual UX-heavy cases.

---

## 8) Cron Job Manual Triggers

Invoke as POST:

- `/functions/v1/cron-jobs/deposit-timeout`
- `/functions/v1/cron-jobs/ttl-enforcement`
- `/functions/v1/cron-jobs/payout-retry`

Verify:

- response summary counters
- corresponding `transaction_status_log` and `error_logs`

---

## 9) Release Gate (Must Pass)

Do not ship unless all pass:

- all A-F happy and edge scenarios
- all I-series security/idempotency checks
- no unexpected `error_logs` spikes
- no mismatch between user copy and final state
- template dispatch/fallback behavior works with current active template
- cap boundary behavior validated for every operator profile in limits baseline

---

## 10) QA Reporting Template

For each failed case, capture:

- Test case ID
- Input sent
- Bot response received
- expected vs actual
- transaction ID
- DB snapshot (`transactions` + `transaction_status_log`)
- proposed fix type (`copy`, `logic`, `both`)

Recommended severity:

- `P0`: wrong money/state behavior
- `P1`: blocked critical flow / security issue
- `P2`: misleading copy / recoverable UX issue
- `P3`: cosmetic wording issue

