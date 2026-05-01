# Clairtus Change Log - 2026-05-01

This document records the full set of changes committed and deployed in this work session.

## 1) Commits Included

### Commit `2da0030`
**Message:** enforce operator-specific transaction caps across runtime and QA docs

**What changed**
- Added runtime limit engine with per-correspondent profiles and effective-cap calculation.
- Applied cap-aware validation to transaction creation, guided flow amount parsing, deposit initiation, and payout initiation.
- Added new env configuration keys and examples for BCC/MNO cap control.
- Added and updated QA specifications to explicitly test BCC/MNO boundaries and operator-specific behavior.

**Files**
- `.env.example`
- `supabase/functions/_shared/transactionLimits.ts` (new)
- `supabase/functions/state-machine/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/_shared/depositFlow.ts`
- `supabase/functions/_shared/payoutFlow.ts`
- `docs/specs/clairtus-escrow-bot/whatsapp-mvp-master-test-suite.md` (new)
- `docs/specs/clairtus-escrow-bot/master-whatsapp-bot-e2e-test-guide.md` (new)

### Commit `f94ece5`
**Message:** fix payout retry cron import for Supabase bundling

**What changed**
- Replaced JSR alias import with explicit Deno std URL import in payout retry cron.
- This fixed Supabase deploy bundling for `cron-jobs-payout-retry`.

**Files**
- `supabase/functions/cron-jobs/payout-retry/index.ts`

### Commit `bc2b67f`
**Message:** remove local secrets file from git and harden ignores

**What changed**
- Removed tracked local env file containing credentials from git.
- Added ignore rules for local/system artifacts.

**Files**
- `.gitignore`
- `docs/specs/clairtus-escrow-bot/.env.local` (removed from repository tracking)

## 2) Deployment Record

Project: `wsavrjhfvfebghlzivvq`

Functions redeployed successfully after the commits above:

- `state-machine` -> version `53` (deployed 2026-05-01 12:48:29 UTC)
- `whatsapp-webhook` -> version `78` (deployed 2026-05-01 12:48:30 UTC)
- `cron-jobs-payout-retry` -> version `32` (deployed 2026-05-01 12:48:33 UTC)

## 3) Functional Impact Summary

### Transaction limit enforcement
- Amount checks are no longer static-only; they now use an effective cap model.
- Effective deposit cap is derived from compliance/operator settings.
- Payout amount is validated against effective payout cap before initiation.
- User-facing guided flows now display cap-aware allowed amount ranges.

### Configuration flexibility
- Runtime now supports central cap control and per-correspondent overrides without code changes.
- Cap behavior can be adjusted via environment values.

### Reliability
- Payout retry cron deployment pipeline issue resolved (import compatibility fix).

### Security hygiene
- Local credentials file is no longer tracked.
- Local artifacts are ignored to reduce accidental commits.

## 4) New/Updated Runtime Config Keys

Defined in `.env.example`:

- `BCC_TOTAL_DEBIT_CAP_USD`
- `DEFAULT_PAYOUT_CAP_USD`
- `PAWAPAY_CORRESPONDENT_LIMITS_JSON`

These are used to derive the effective cap behavior at runtime.

