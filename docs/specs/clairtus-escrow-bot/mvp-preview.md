# Clairtus MVP Preview Guide (Pre-Phase 7)

This guide lets you preview the MVP end-to-end before Phase 7 testing starts.

It includes:

- Local backend runtime preview (Supabase + Edge Functions)
- End-to-end escrow lifecycle simulation
- Admin panel preview walkthrough
- Data inspection checkpoints so you can confirm behavior

---

## 1) What You Will Preview

Current MVP scope (Phases 1-6) in one pass:

1. Seller creates a transaction (`INITIATED`)
2. Counterparty accepts (`PENDING_FUNDING`)
3. PawaPay deposit webhook secures funds (`SECURED`)
4. PawaPay payout webhook completes escrow (`COMPLETED`)
5. Audit trail + error logging + status transitions become visible in database
6. Admin panel pages render operational views (transactions, metrics, float, errors, users)

---

## 2) Prerequisites

- Docker is running
- Supabase CLI installed
- Local stack starts from repo root:
  - `supabase start`
- Local edge env is available in `supabase/functions/.env.local` (or exported in shell):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `META_APP_SECRET`
  - `META_VERIFY_TOKEN`
  - `PAWAPAY_API_SECRET`
  - Optional for full WhatsApp send calls: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`

Notes:

- Preview flow works even if outbound WhatsApp sending is not configured; most send failures are logged and do not block state transitions.
- If your local gateway requires API key for functions calls, export:
  - `SUPABASE_ANON_KEY`

---

## 3) One-Command Backend Preview

From repo root:

```bash
chmod +x "supabase/tests/mvp_preview_flow.sh"
"supabase/tests/mvp_preview_flow.sh"
```

What this script does:

- Calls `state-machine` with `create_transaction`
- Simulates buyer acceptance through signed `whatsapp-webhook`
- Simulates signed PawaPay deposit callback through `pawapay-webhook`
- Simulates signed PawaPay payout callback through `pawapay-webhook`
- If `SUPABASE_SERVICE_ROLE_KEY` is present, prints:
  - final transaction snapshot
  - status log trail

Script location:

- `supabase/tests/mvp_preview_flow.sh`

---

## 4) Manual Preview Endpoints (Optional)

If you want to test individual components manually:

- `state-machine`:
  - `POST /functions/v1/state-machine`
- `whatsapp-webhook`:
  - `GET /functions/v1/whatsapp-webhook` (Meta verification)
  - `POST /functions/v1/whatsapp-webhook` (signed events)
- `pawapay-webhook`:
  - `POST /functions/v1/pawapay-webhook` (signed events)
- CRON-style function entrypoints:
  - `POST /functions/v1/cron-jobs/ttl-enforcement`
  - `POST /functions/v1/cron-jobs/deposit-timeout`
  - `POST /functions/v1/cron-jobs/payout-retry`
  - `POST /functions/v1/cron-jobs/float-monitor`

---

## 5) Admin Panel Preview

From `admin-panel`:

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/login`

Then review:

- `Dashboard` (`/dashboard`)
- Admin metrics (`/admin/dashboard`)
- Transactions list/details (`/admin/transactions`)
- User management (`/admin/users`)
- Error log viewer (`/admin/errors`)
- Messages view (`/admin/messages`)

Required env keys in `admin-panel/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_EMAIL_ALLOWLIST`

---

## 6) What “Good” Looks Like

After running preview flow:

- Transaction ends in `COMPLETED`
- `transaction_status_log` contains expected path entries:
  - `COUNTERPARTY_ACCEPT`
  - deposit-related processed event(s)
  - `PAYOUT_SUCCEEDED` plus payout processed event
- `pawapay_deposit_id` and `pawapay_payout_id` are persisted
- `users.successful_transactions` increases on payout success

---

## 7) If Preview Fails

Quick checks:

1. `supabase status` confirms local services are healthy
2. Function secrets are available to edge runtime (`META_APP_SECRET`, `PAWAPAY_API_SECRET`)
3. Signature mismatch errors usually mean:
   - wrong secret
   - payload modified after signature generation
4. If function calls return auth errors, export `SUPABASE_ANON_KEY` before running script

---

## 8) Next Step

Once this preview looks good, proceed to Phase 7 Task 30.x unit tests using the same local setup baseline.
