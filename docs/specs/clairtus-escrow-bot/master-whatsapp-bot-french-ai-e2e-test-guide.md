# Clairtus WhatsApp Bot - French-Only + AI Cyborg E2E Test Guide

## 1) Purpose

Use this guide to validate, end-to-end, that:

- the bot conversation is strictly in French
- non-French free text is blocked before business actions
- AI extraction runs only in the allowed context
- the deterministic state machine remains in control of money and statuses
- audit logs capture AI confirmation/cancellation with raw text for prompt tuning

Run this guide after any change to:

- `whatsapp-webhook`
- `state-machine`
- `_shared/ai/nlpExtractor.ts`
- related secrets/runtime flags

---

## 2) Scope

This guide covers:

- French-only enforcement at webhook routing level
- AI free-text extraction (idle users, long text)
- confirmation buttons (`Oui, continuer` / `Non, annuler`)
- safe handoff into deterministic transaction creation
- fallback behavior when AI returns `UNKNOWN`
- observability and audit logs for AI flows

Out of scope:

- frontend/admin UI
- non-WhatsApp channels

---

## 3) Environment Setup

## 3.1 Required Secrets

Validate these exist in the target Supabase project:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_API_VERSION`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (recommended: `gpt-4o-mini`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or equivalent secret key alias)

## 3.2 Runtime Flags For Current UAT

For your current hybrid test mode:

- `ALLOW_NON_DRC_TEST_NUMBERS=true`
- `PAWAPAY_BASE_URL=https://api.sandbox.pawapay.io`

## 3.3 Deployment Baseline

Before running cases, confirm:

- migration `013_create_ai_transaction_drafts.sql` is applied
- `state-machine` and `whatsapp-webhook` are deployed

---

## 4) Test Personas

Prepare at least:

- **User A (South Africa):** initiator for `VENDRE`
- **User B (South Africa):** counterparty for `ACHETER/VENDRE` tests
- **User C:** for ambiguous and non-French tests

All numbers should be in E.164 for setup references.

---

## 5) Preflight Checklist (Go/No-Go)

Run and confirm:

1. Real sender is connected in Meta:
   - `status: CONNECTED`
   - correct `display_phone_number`
2. Token is valid (no OAuth error `190`)
3. Supabase secrets were updated after token rotation
4. Bot responds to `BONJOUR` in French
5. No pending infra incident in Supabase/Meta dashboards

If any check fails: **NO-GO**.

---

## 6) Expected Core Behavior (Reference)

Use this as quick truth table:

- **Idle + long French text** -> AI extraction path
- **AI intent UNKNOWN** -> hardcoded French menu fallback
- **AI extracted fields available** -> confirmation step first (no direct tx creation)
- **Tap Non** -> cancel AI draft, no tx creation
- **Tap Oui** -> deterministic tx creation via state-machine
- **Non-French text** -> blocked with French-only guidance

---

## 7) Full Scenario Suite

## A. French-Only Policy Enforcement

### TC-FR-01 English-only message block

1. Send: `I want to sell my phone for 150 dollars to +27821234567`

Expected:

- bot does not start AI create flow
- bot responds in French-only policy message
- no `ai_transaction_drafts` row created

### TC-FR-02 Mixed language edge

1. Send: `bonjour i want to buy laptop fast`

Expected:

- if message is not French-enough, blocked by French-only rule
- bot asks to resend in French
- no transaction created

### TC-FR-03 Valid French pass-through

1. Send: `Bonjour, je veux vendre un frigo à 150 USD au +27821234567`

Expected:

- message is accepted as French
- AI flow starts (confirmation step)

## B. AI Extraction + Confirmation

### TC-AI-01 VENDRE extraction + Oui

1. User A sends: `Je veux vendre mon frigo à 150 USD au +27821234567`
2. Tap `Oui, continuer`

Expected:

- confirmation message includes `VENDRE`, amount, counterparty
- after `Oui`, transaction is created via state machine
- status starts at `INITIATED`
- `AI_PREFILL_CONFIRMED` audit exists

### TC-AI-02 ACHETER extraction + Non

1. User A sends: `Je veux acheter un iPhone 11 à 320 usd avec +27761234567`
2. Tap `Non, annuler`

Expected:

- AI draft is removed
- no transaction created
- menu/restart guidance returned
- `AI_PREFILL_CANCELLED` audit exists

### TC-AI-03 Unknown extraction fallback

1. Send ambiguous French text:
   - `Securise juste un deal pour moi stp`

Expected:

- AI returns `UNKNOWN` (or insufficient structured extraction)
- fallback menu shown in French (`VENDRE` / `ACHETER`)
- no direct creation call succeeds

## C. Guardrail Integrity (Golden Rule)

### TC-GR-01 No creation without explicit Oui

1. Send valid AI-extractable French message
2. Do not press any button

Expected:

- no transaction row created from that draft
- only AI draft exists temporarily

### TC-GR-02 Limits still enforced

1. Send French message with amount above effective cap
   - example: `Je veux vendre ... à 999999 USD ...`

Expected:

- creation blocked by deterministic validation
- user receives French error guidance
- no bypass through AI path

### TC-GR-03 Same number as counterparty

1. Send message where initiator phone == counterparty phone

Expected:

- rejected with role separation rule
- no transaction created

## D. State/Context Routing Safety

### TC-CTX-01 Active strict flow should bypass AI

1. Start guided flow so user is in an active stage
2. Send long free text sentence

Expected:

- AI extractor is not used
- strict guided stage handling remains in control

### TC-CTX-02 Button-only actions keep deterministic path

1. Use action buttons on an existing transaction

Expected:

- normal deterministic transition route
- no AI prefill branch triggered

---

## 8) Message Pack For Live UAT

Use these 8 ready-to-send messages:

1. `Je veux vendre mon frigo à 150 USD au +27821234567`
2. `Je veux acheter iPhone 11 à 320 usd avec +27761234567`
3. `Securise juste un deal pour moi stp`
4. `I want to sell my TV to +27835550000`
5. `bonjour i need help with contract now`
6. `Je veux vendre ma console à 999999 USD au +27835550000`
7. `Je veux vendre ma table à 100 USD au +243837700923` (same-number check if sender is this number)
8. `Bonjour, je veux commencer`

Track each case with PASS/FAIL + screenshot.

---

## 9) DB Validation Checklist (per AI case)

Validate with SQL after each scenario:

### 9.1 AI draft presence/removal

```sql
select phone_number, intent, amount_usd, counterparty_phone, raw_user_text, updated_at
from ai_transaction_drafts
order by updated_at desc
limit 20;
```

### 9.2 AI confirmation/cancellation audit trail

```sql
select created_at, error_type, error_message, error_details
from error_logs
where error_type in ('AI_PREFILL_CONFIRMED', 'AI_PREFILL_CANCELLED')
order by created_at desc
limit 50;
```

### 9.3 Transaction status event for confirmed path

```sql
select created_at, transaction_id, old_status, new_status, event, reason, changed_by
from transaction_status_log
where event = 'AI_PREFILL_CONFIRMED'
order by created_at desc
limit 50;
```

### 9.4 No ghost creation on Non/UNKNOWN

```sql
select id, status, initiator_phone, seller_phone, buyer_phone, base_amount, created_at
from transactions
order by created_at desc
limit 30;
```

Expected:

- `Non` and policy-blocked messages must not produce unexpected new rows.

---

## 10) API/Log Signals To Watch

Minimum observability:

- `error_logs.error_type`:
  - `AI_PREFILL_CONFIRMED`
  - `AI_PREFILL_CANCELLED`
  - `WHATSAPP_CREATE_TRANSACTION_FAILED`
  - signature/dispatch failures
- `transaction_status_log.event`:
  - `AI_PREFILL_CONFIRMED`
  - normal lifecycle events after confirmation

---

## 11) Pass/Fail Criteria

**PASS** when all are true:

- conversation remains French-only at user level
- non-French free text is blocked deterministically
- AI only pre-fills and never bypasses confirmation
- `Oui` creates, `Non` cancels, `UNKNOWN` falls back
- DB + logs match expected behavior for each case

**FAIL** if any occurs:

- transaction created without explicit `Oui`
- non-French free text enters creation path
- AI logs missing or inconsistent
- limits/phone rules bypassed

---

## 12) Incident/Rollback Procedure

If production risk is detected:

1. Set `OPENAI_API_KEY` to empty (or invalid) to force fallback behavior.
2. Redeploy `whatsapp-webhook` if needed.
3. Keep deterministic guided flow active as safe fallback.
4. Log incident window and affected references.

---

## 13) UAT Sign-Off Template

Record:

- Test date/time:
- Environment/project ref:
- WhatsApp sender verified:
- Token verified:
- Tester numbers used:
- Scenario pass rate:
- Blocking defects:
- Final decision: `GO` / `NO-GO`
- Approved by (Ops/Tech):

