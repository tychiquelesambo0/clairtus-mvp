# Implementation Plan: Clairtus Escrow Bot

## Overview

This document provides a comprehensive, step-by-step implementation plan for the Clairtus WhatsApp-native escrow bot. The tasks are designed for AI coding assistants and follow a chronological approach from database setup through production deployment. Each task is bite-sized (15-30 minutes) and includes specific file paths, dependencies, and verification steps.

## Tasks

### Phase 1: Project & Database Setup

- [x] 1. Initialize Supabase project and configuration
  - Create new Supabase project via dashboard
  - Configure project settings and obtain API keys
  - Create `supabase/config.toml` with project configuration
  - Set up local development environment with Supabase CLI
  - _Requirements: 16.1, 16.2, 16.3_
  - Status: Completed: hosted project created (`wsavrjhfvfebghlzivvq`), CLI authenticated + linked, local runtime validated (`supabase start` + `supabase status`), and Supabase API keys set in local env file. See `docs/specs/clairtus-escrow-bot/phase1-ops-runbook.md`.

- [x] 2. Create core database schema
  - [x] 2.1 Create users table with constraints
    - Create `supabase/migrations/001_create_users_table.sql`
    - Implement phone_number PRIMARY KEY with E.164 format validation
    - Add successful_transactions, cancelled_transactions counters
    - Add is_suspended flag and created_at timestamp
    - _Requirements: 16.1, 20.1, 20.2, 20.3_
  
  - [x] 2.2 Create transactions table with full schema
    - Create `supabase/migrations/002_create_transactions_table.sql`
    - Implement all columns: id (UUID), status, parties, amounts, fees
    - Add CHECK constraints for currency='USD', amount ranges 1-2500
    - Add FOREIGN KEY constraints to users table
    - Add UNIQUE constraints on PawaPay IDs
    - _Requirements: 16.2, 16.4, 16.5, 16.6, 16.7, 21.1, 21.2_
  
  - [x] 2.3 Create audit and logging tables
    - Create `supabase/migrations/003_create_audit_tables.sql`
    - Implement transaction_status_log for state change tracking
    - Implement messages_log for admin custom messages
    - Implement error_logs for system error tracking
    - _Requirements: 22.1, 22.2, 24.1, 24.2, 24.3, 24.4_

- [x] 3. Set up database indexes and triggers
  - [x] 3.1 Create performance indexes
    - Create `supabase/migrations/004_create_indexes.sql`
    - Add indexes on transactions.status, expires_at, seller_phone, buyer_phone
    - Add indexes on transaction_status_log.transaction_id
    - Add indexes on error_logs by type and timestamp
    - _Requirements: Performance optimization_
  
  - [x] 3.2 Create database triggers
    - Create `supabase/migrations/005_create_triggers.sql`
    - Implement updated_at trigger for transactions table
    - Implement automatic expires_at calculation (72h default) [superseded by architecture clarification: managed by Edge Functions]
    - _Requirements: 16.8, 16.9_

- [x] 4. Configure Row Level Security (RLS)
  - Create `supabase/migrations/006_setup_rls.sql`
  - Enable RLS on all tables
  - Create policies for authenticated (admin) and service_role access
  - Test RLS policies with different role contexts
  - _Requirements: Security architecture_
  - Status: migration implemented and runtime policy smoke tests completed via `supabase/tests/phase1_rls_runtime_smoke.sql`. See `docs/specs/clairtus-escrow-bot/phase1-ops-runbook.md`.

- [x] 5. Set up environment variables and secrets
  - Configure Supabase project environment variables
  - Set up Meta WhatsApp API credentials (sandbox)
  - Set up PawaPay API credentials (sandbox)
  - Create `.env.example` file with required variables
  - Document secret rotation procedures
  - _Requirements: 12.1, 12.2, Security architecture_
  - Status: Completed: `.env.example` and `docs/specs/clairtus-escrow-bot/secret-rotation.md` are in place, sandbox Meta/PawaPay credentials were captured, and secrets were injected into linked Supabase project (`supabase secrets list` shows configured entries).

### Phase 2: Meta API Boilerplate & Webhooks

- [x] 6. Create Supabase Edge Functions structure
  - Initialize `supabase/functions/` directory structure
  - Create `supabase/functions/whatsapp-webhook/index.ts`
  - Create `supabase/functions/pawapay-webhook/index.ts`
  - Set up TypeScript configuration and imports
  - _Requirements: Infrastructure setup_
  - Status: `supabase/functions/` scaffold created with `deno.json`, shared utility modules, and function entrypoints at `supabase/functions/whatsapp-webhook/index.ts` and `supabase/functions/pawapay-webhook/index.ts`.

- [x] 7. Implement WhatsApp webhook endpoint
  - [x] 7.1 Create webhook verification handler
    - Implement GET endpoint for Meta webhook verification
    - Handle hub.challenge parameter validation
    - Return challenge value for successful verification
    - _Requirements: 12.1, Meta API integration_
    - Status: `supabase/functions/whatsapp-webhook/index.ts` now validates `hub.mode`, `hub.verify_token`, and `hub.challenge`, then returns the raw challenge on successful verification.
  
  - [x] 7.2 Implement webhook signature validation
    - Create X-Hub-Signature-256 validation function
    - Use Meta App Secret for HMAC-SHA256 verification
    - Return 401 Unauthorized for invalid signatures
    - Log validation failures for security monitoring
    - _Requirements: 12.1, 12.2, Security architecture_
    - Status: `supabase/functions/whatsapp-webhook/index.ts` now verifies `x-hub-signature-256` using HMAC-SHA256 with `META_APP_SECRET`, returns `401` on invalid/missing signature, and logs failures into `public.error_logs`.
  
  - [x] 7.3 Create basic message parsing
    - Parse incoming webhook payload structure
    - Extract message text and sender phone number
    - Handle both text messages and Interactive Button payloads
    - Normalize phone numbers to E.164 format
    - _Requirements: 18.1, 18.2, 28.1, 28.2, 28.3, 28.4_
    - Status: `supabase/functions/whatsapp-webhook/index.ts` now parses Meta webhook payload entries, extracts sender + message content for text and interactive/button replies, and normalizes sender phone numbers to E.164 (`+243...`).

- [x] 8. Implement PawaPay webhook endpoint
  - [x] 8.1 Create PawaPay signature validation
    - Implement PawaPay webhook signature verification
    - Use PawaPay API secret for HMAC validation
    - Return 401 for invalid signatures
    - _Requirements: 12.2, Security architecture_
    - Status: `supabase/functions/pawapay-webhook/index.ts` now validates webhook signatures using HMAC-SHA256 with `PAWAPAY_API_SECRET` and rejects invalid/missing signatures with `401`.
  
  - [x] 8.2 Create webhook payload processing
    - Parse PawaPay deposit/payout/refund webhooks
    - Extract transaction ID from idempotency key
    - Handle duplicate webhook detection
    - Return HTTP 200 within 5 seconds
    - _Requirements: 27.1, 27.2, 27.3, 27.4_
    - Status: webhook payload parsing implemented for deposit/payout/refund shapes, transaction UUID is extracted from idempotency fields, duplicates are deduplicated via `transaction_status_log` event keys, and valid signed callbacks are acknowledged with HTTP `200`.

- [x] 9. Create message routing and basic responses
  - Implement message type detection (text vs button)
  - Create basic response system for unknown commands
  - Implement text fallback mapping for Interactive Buttons
  - Add rate limiting per phone number (5 transactions/hour)
  - _Requirements: 2.8, 25.1, Text fallback handling_
  - Status: `supabase/functions/whatsapp-webhook/index.ts` now routes parsed text/button inputs to intents, maps text fallbacks for `ACCEPTER`/`REFUSER`/`AIDE`, returns unknown-command guidance, and enforces a DB-backed `5 transactions/hour` limit for transaction-intent messages.

### Phase 3: State Machine Logic

- [x] 10. Implement core state machine engine
  - [x] 10.1 Create state transition framework
    - Create `supabase/functions/state-machine/index.ts`
    - Define TransactionStatus and StateEvent enums
    - Implement state transition validation matrix
    - Create atomic database transaction wrapper
    - _Requirements: State machine specification_
    - Status: `supabase/functions/state-machine/index.ts` now defines strict `TransactionStatus` and `StateEvent` enums, transition matrix validation, and a compare-and-set transition wrapper (`applyStatusTransitionAtomic`) with state-change logging.
  
  - [x] 10.2 Implement transaction creation logic
    - Parse "Vente/Achat" message format with regex
    - Validate amount ranges (1-2500 USD), currency (USD only)
    - Create transaction record with INITIATED status
    - Calculate and store MNO fee (1.5%) and Clairtus fee (2.5%)
    - _Requirements: 1.1, 1.2, 1.3, 18.3, 18.5, 18.6, 21.1, 21.2_
    - Status: state-machine creation action now parses `Vente/Achat` inputs via regex, validates USD and amount constraints, normalizes phones to E.164, inserts `INITIATED` transactions, and stores computed `mno_fee` (1.5%) and `clairtus_fee` (2.5%).

- [x] 11. Implement phone number normalization
  - Create phone number validation and normalization functions
  - Handle 10-digit (0XXXXXXXXX), 12-digit (243XXXXXXXXX), E.164 formats
  - Reject invalid phone number formats with error messages
  - Store all phone numbers in E.164 format
  - _Requirements: 1.4, 1.5, 28.1, 28.2, 28.3, 28.4, 28.5_
  - Status: shared phone utility added at `supabase/functions/_shared/phone.ts` with strict validation and E.164 normalization (`+243...`). `state-machine` now enforces normalization via shared helper, and `whatsapp-webhook` rejects invalid numbers with explicit error messages while exposing normalized sender phones for downstream processing.

- [x] 12. Implement trust score calculation and display
  - Query successful_transactions and cancelled_transactions from users table
  - Format trust score as "🟢 [X] ventes réussies | ❌ [Y] annulations"
  - Handle new users with "🆕 Nouveau utilisateur - Aucun historique"
  - Cache trust scores for performance (< 500ms requirement)
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - Status: shared trust-score service added in `supabase/functions/_shared/trustScore.ts` with users-table lookups, required display formatting, new-user handling, and in-memory TTL caching. `state-machine` transaction creation now returns buyer/seller trust score payloads and exposes `trust_score_sla_met` based on 500ms threshold.

- [x] 13. Create PIN generation and validation system
  - [x] 13.1 Implement cryptographic PIN generation
    - Use crypto.randomInt for secure 4-digit PIN generation
    - Store PIN in secret_pin column when transaction becomes SECURED
    - Ensure PIN contains only numeric characters 0-9
    - _Requirements: 4.1, 4.2, 4.3, PIN security_
    - Status: shared PIN utility added at `supabase/functions/_shared/pin.ts` with cryptographically secure 4-digit generation (Deno `crypto.getRandomValues`) and numeric-only output; state-machine `generate_pin` action now stores PIN in `secret_pin` for `SECURED` transactions.
  
  - [x] 13.2 Implement PIN validation with attempt limiting
    - Create constant-time PIN comparison function
    - Track PIN attempts in pin_attempts column
    - Lock transaction after 3 failed attempts (PIN_FAILED_LOCKED)
    - Send appropriate error messages for incorrect PINs
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, PIN security_
    - Status: state-machine `validate_pin` action uses constant-time comparison, increments `pin_attempts` on failures, transitions to `PIN_FAILED_LOCKED` with `requires_human=true` on 3rd failure, logs status change, and returns requirement-aligned user-facing messages.

- [x] 14. Implement Interactive Button message system
  - [x] 14.1 Create Interactive Button templates
    - Implement Meta Interactive Message API integration
    - Create ACCEPTER/REFUSER button template for transaction initiation
    - Create AIDE button for human support escalation
    - Include transaction ID in button payloads
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 19.1, 19.2, 19.3, 19.4_
    - Status: Meta interactive utilities added in `supabase/functions/_shared/whatsappInteractive.ts` (send API integration, ACCEPTER/REFUSER/AIDE templates, and `TXN|<transaction_id>|<ACTION>` payload format). State-machine now dispatches initiation interactive messages after transaction creation.
  
  - [x] 14.2 Handle Interactive Button responses
    - Process button click payloads from Meta webhooks
    - Extract transaction ID and action from payload
    - Trigger appropriate state transitions
    - Respond within 2 seconds as required
    - _Requirements: 2.5, 2.6, 19.5, 19.6_
    - Status: `whatsapp-webhook` now parses interactive payloads, extracts action + transaction UUID, applies ACCEPT/REJECT status transitions (`INITIATED -> PENDING_FUNDING/CANCELLED`) or sets `requires_human` for AIDE, and returns immediate webhook acknowledgments.

### Phase 4: PawaPay Integration

- [x] 15. Create PawaPay API client
  - [x] 15.1 Implement PawaPay authentication
    - Create PawaPay API client with Bearer token authentication
    - Implement request/response logging for debugging
    - Add retry logic with exponential backoff
    - Handle API rate limiting and timeouts
    - _Requirements: PawaPay integration_
    - Status: shared PawaPay client added at `supabase/functions/_shared/pawapayClient.ts` with Bearer auth (`PAWAPAY_API_KEY`), structured request/response logging, timeout handling, `429/5xx/408` retry logic with exponential backoff, and API error logging to `error_logs`.
  
  - [x] 15.2 Implement idempotency key management
    - Use transaction UUID as idempotency key for all PawaPay calls
    - Handle duplicate request responses gracefully
    - Ensure same idempotency key used for retries
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
    - Status: `callPawaPay` enforces transaction UUID idempotency via exported `buildPawaPayIdempotencyKey`, sets `Idempotency-Key` header on all transaction-scoped calls, preserves the same key across retries, and flags duplicate responses (`409`/duplicate markers) for graceful handling.

- [x] 16. Implement deposit initiation flow
  - [x] 16.1 Create deposit API integration
    - Call PawaPay /v1/deposits with base_amount + MNO_fee
    - Handle PawaPay Checkout Page URL response
    - Store pawapay_deposit_id in database
    - Send deposit URL to buyer via WhatsApp
    - _Requirements: 3.1, 3.2, 3.3_
    - Status: shared deposit service added in `supabase/functions/_shared/depositFlow.ts` using `/v1/deposits` with transaction UUID idempotency key, amount=`base_amount + mno_fee`, checkout URL extraction, `pawapay_deposit_id` persistence, and WhatsApp URL delivery to buyer. Deposit initiation is wired from counterparty ACCEPT handling and exposed via `state-machine` action `initiate_deposit`.
  
  - [x] 16.2 Handle deposit confirmation webhook
    - Process PawaPay deposit webhook events
    - Transition transaction to SECURED status on success
    - Generate and distribute PIN to buyer and vendor
    - Handle deposit failures and timeouts
    - _Requirements: 3.4, 3.5, 4.4, 4.5, 4.6_
    - Status: `supabase/functions/pawapay-webhook/index.ts` now processes deposit events, transitions `PENDING_FUNDING -> SECURED` on successful deposits, generates/stores delivery PIN, sends buyer/vendor secured notifications, and handles failure/timeout statuses by cancelling transaction and notifying both parties; duplicate events are deduplicated via status-log event keys.

- [x] 17. Implement payout execution logic
  - [x] 17.1 Create payout API integration
    - Call PawaPay /v1/payouts with base_amount - Clairtus_fee
    - Handle different payout error scenarios
    - Store pawapay_payout_id in database
    - _Requirements: 5.3, 5.4_
    - Status: shared payout service added at `supabase/functions/_shared/payoutFlow.ts` using `/v1/payouts` with transaction UUID idempotency key and amount=`base_amount - clairtus_fee`; it persists `pawapay_payout_id`, classifies payout error scenarios (`RECEIVER_LIMIT_EXCEEDED`, timeout, duplicate, unknown), and is wired to `state-machine` (`validate_pin` success and explicit `initiate_payout` action).
  
  - [x] 17.2 Handle payout confirmation webhook
    - Process PawaPay payout webhook events
    - Transition transaction to COMPLETED on success
    - Update user success counters
    - Send confirmation messages to both parties
    - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9_
    - Status: `supabase/functions/pawapay-webhook/index.ts` now processes payout events, transitions successful payout transactions to `COMPLETED`, increments `successful_transactions` for buyer and seller, sends completion confirmations, stores payout IDs, and deduplicates repeated webhook events.

- [x] 18. Implement error handling for PawaPay scenarios
  - [x] 18.1 Handle wallet limit exceeded errors
    - Detect RECEIVER_LIMIT_EXCEEDED error from PawaPay
    - Transition to PAYOUT_FAILED status
    - Send retry button to vendor
    - Implement retry logic with same idempotency key
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
    - Status: payout flow now classifies `RECEIVER_LIMIT_EXCEEDED`, transitions transactions to `PAYOUT_FAILED`, sends vendor retry interactive buttons (`REESSAYER` + `AIDE`), and uses the same transaction UUID idempotency key for every retry attempt.
  
  - [x] 18.2 Handle MNO network timeout errors
    - Detect 503 Service Unavailable and timeout errors
    - Transition to PAYOUT_DELAYED status
    - Send reassurance message to vendor
    - Set up for CRON retry logic
    - _Requirements: 9.1, 9.2_
    - Status: payout flow now classifies timeout/503 responses, transitions transactions to `PAYOUT_DELAYED`, sends vendor reassurance messaging, and persists delayed status for upcoming CRON-based retry handling.

- [x] 19. Implement refund handling
  - Create PawaPay refund API integration
  - Handle TTL expiration refunds (base_amount only, no MNO fee)
  - Handle user cancellation refunds
  - Store pawapay_refund_id in database
  - _Requirements: 10.3, 10.4, 10.5, 10.9_
  - Status: shared refund service added at `supabase/functions/_shared/refundFlow.ts` using `/v1/refunds` with transaction UUID idempotency, refund amount fixed to `base_amount` (MNO fee excluded), and `pawapay_refund_id` persistence. `state-machine` now exposes `initiate_refund` for `TTL_EXPIRED`/`USER_CANCELLED`, and `pawapay-webhook` processes refund confirmations to persist IDs and finalize `CANCELLED` state.

### Phase 5: CRON Jobs & Edge Cases

- [x] 20. Implement TTL enforcement CRON job
  - [x] 20.1 Create TTL enforcement function
    - Create `supabase/functions/cron-jobs/ttl-enforcement/index.ts`
    - Query expired INITIATED transactions (24h timeout)
    - Query expired SECURED transactions (72h timeout)
    - Transition expired transactions to CANCELLED
    - _Requirements: 1.9, 10.1, 10.2_
    - Status: added `supabase/functions/cron-jobs/ttl-enforcement/index.ts` with scheduled POST handler that queries expired `INITIATED` and `SECURED` transactions by `expires_at`, processes each record, and transitions them to `CANCELLED` with audit logging.
  
  - [x] 20.2 Handle TTL expiration consequences
    - Initiate refunds for expired SECURED transactions
    - Update cancelled_transactions counter for at-fault party
    - Send appropriate notifications to both parties
    - _Requirements: 10.6, 10.7, 10.8_
    - Status: TTL handler now initiates refund calls for expired `SECURED` transactions (base amount only via shared refund flow), increments vendor `cancelled_transactions`, and sends buyer/vendor timeout notifications.

- [x] 21. Implement payout retry CRON job
  - [x] 21.1 Create payout retry function
    - Create `supabase/functions/cron-jobs/payout-retry/index.ts`
    - Query transactions with PAYOUT_DELAYED status
    - Retry PawaPay payouts using same idempotency key
    - Handle successful retries and continued failures
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7_
    - Status: added `supabase/functions/cron-jobs/payout-retry/index.ts` to query `PAYOUT_DELAYED` transactions and retry payouts via shared payout flow, which reuses transaction UUID idempotency keys and reports accepted vs still-failing retries.
  
  - [x] 21.2 Handle retry timeout escalation
    - Escalate by setting requires_human=true after 24h of retries
    - Send alerts to admin panel
    - _Requirements: 9.7_
    - Status: payout-retry cron now escalates delayed transactions older than 24h by setting `requires_human=true` (without changing `status`), logs `PAYOUT_RETRY_TIMEOUT_ESCALATED` audit events, sends seller escalation notice, and records admin alert entries in `error_logs`.

- [x] 22. Implement deposit timeout handling
  - Create deposit timeout CRON job (every 5 minutes)
  - Query PENDING_FUNDING transactions older than 30 minutes
  - Transition timed-out deposits to CANCELLED
  - Send timeout notifications to users
  - _Requirements: 3.5_
  - Status: added `supabase/functions/cron-jobs/deposit-timeout/index.ts` to scan `PENDING_FUNDING` transactions older than 30 minutes, transition them to `CANCELLED`, log `DEPOSIT_TIMEOUT` events, and notify buyer/seller.

- [x] 23. Implement float balance monitoring
  - [x] 23.1 Create balance monitoring CRON job
    - Create `supabase/functions/cron-jobs/float-monitor/index.ts`
    - Query PawaPay /v1/balances API every 10 minutes
    - Cache balance with 5-minute expiration (no Redis dependency)
    - _Requirements: 23.3, 23.6_
    - Status: added `supabase/functions/cron-jobs/float-monitor/index.ts` and shared `supabase/functions/_shared/floatMonitor.ts` to query `/v1/balances` and cache payout balance for 5 minutes using local in-process cache (no Redis).
  
  - [x] 23.2 Implement float depletion protection
    - Block new transactions when balance < $500
    - Send critical alerts when balance < $500
    - Send warning alerts when balance < $1000
    - Return maintenance message for blocked transactions
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
    - Status: float assessment now blocks transaction creation in `state-machine` when payout balance is below $500 with maintenance message, and emits warning/critical admin alert entries via `error_logs` for balances below $1000/$500.

- [x] 24. Implement rate limiting and abuse prevention
  - [x] 24.1 Create user rate limiting
    - Implement 5 transactions per hour limit per user
    - Track rate limits without Redis (Supabase/Postgres based)
    - Return rate limit exceeded message
    - _Requirements: 25.1_
    - Status: shared abuse module at `supabase/functions/_shared/abusePrevention.ts` enforces 5/hour limits using Supabase/Postgres transaction history in a rolling 1-hour window, with enforcement wired into `state-machine`.
  
  - [x] 24.2 Implement user suspension logic
    - Auto-suspend users with 3+ PIN_FAILED_LOCKED transactions
    - Block all transactions for suspended users
    - Provide admin interface to unsuspend users
    - _Requirements: 25.2, 25.3, 25.4_
    - Status: auto-suspension now runs after PIN lock events (`validate_pin`) by checking seller `PIN_FAILED_LOCKED` count and setting `users.is_suspended=true` at threshold >=3; transaction initiation paths now reject suspended users; `state-machine` adds `set_user_suspension` action as admin integration point for suspend/unsuspend operations.

- [x] 25. Implement human support escalation system
  - [x] 25.1 Create support request handling
    - Detect "AIDE", "Help", "Support" text commands
    - Handle AIDE Interactive Button clicks
    - Set requires_human flag and halt automation
    - Send acknowledgment message to user
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
    - Status: `whatsapp-webhook` now handles AIDE/Help/Support intents from text and button payloads, resolves active transaction context when needed, sets `requires_human=true`, halts automated transitions for already-escalated transactions, and sends user acknowledgment message ("🆘 Demande d'assistance enregistrée...").
  
  - [x] 25.2 Create admin panel integration points
    - Send alerts to admin panel for human escalations
    - Provide transaction context for admin review
    - Enable admin override of automation halt
    - _Requirements: 7.6_
    - Status: human escalation now writes admin alert records (`ADMIN_ALERT_HUMAN_SUPPORT_REQUESTED`) with transaction context into `error_logs`, logs `HUMAN_SUPPORT_REQUESTED` audit events, and supports admin override of automation halt via `state-machine` `set_requires_human` action.

### Phase 6: Admin Panel Development

- [x] 26. Set up Next.js admin panel project
  - [x] 26.1 Initialize Next.js project structure
    - Create Next.js project with TypeScript
    - Set up Supabase client configuration
    - Configure Supabase Auth for admin access
    - Set up Tailwind CSS for styling
    - _Requirements: Admin panel specifications_
    - Status: initialized `admin-panel` Next.js (App Router + TypeScript + Tailwind), added Supabase SSR client setup for browser/server/middleware (`src/lib/supabase/*`), and configured environment scaffolding via `.env.example` for URL/anon key/admin allowlist.
  
  - [x] 26.2 Create authentication system
    - Implement Supabase Auth login/logout
    - Create protected route middleware
    - Set up admin user management
    - _Requirements: Admin panel security_
    - Status: implemented login page (`/login`) with Supabase Auth password sign-in, server-side logout from `/dashboard`, middleware route protection for authenticated sessions, admin-only guarding via `ADMIN_EMAIL_ALLOWLIST`, and an admin user-management screen at `/admin/users` with suspend/unsuspend actions.

- [x] 27. Implement transaction management interface
  - [x] 27.1 Create transaction list view
    - Display transactions with filtering by status, date, phone
    - Implement pagination (50 per page)
    - Add search functionality by transaction ID or phone
    - Show key metrics: status, amount, parties, timestamps
    - _Requirements: 14.1, 14.2_
    - Status: added admin list view at `/admin/transactions` with filters (status/date/phone), transaction ID/phone search, 50-row pagination, and per-page metrics/status distribution; list rows expose core transaction columns and detail navigation.
  
  - [x] 27.2 Create transaction detail view
    - Show complete transaction information including PIN
    - Display status history from transaction_status_log
    - Show PawaPay IDs with clickable links
    - Display any error logs for the transaction
    - _Requirements: 14.3_
    - Status: created `/admin/transactions/[id]` detail screen with full transaction data (including `secret_pin` and `requires_human`), ordered status history from `transaction_status_log`, PawaPay reference links, and latest transaction-scoped `error_logs`.
  
  - [x] 27.3 Implement manual intervention actions
    - Add Force Payout button for applicable states
    - Add Force Refund button for applicable states
    - Add Resume Automation button for requires_human=true
    - Implement confirmation dialogs for destructive actions
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10_
    - Status: added manual action panel with confirmation dialogs and action gating by state; actions call admin API route (`/api/admin/transactions/[id]/actions`) that invokes `state-machine` for `initiate_payout`, `initiate_refund`, and `set_requires_human(false)`.

- [x] 28. Create custom messaging interface
  - [x] 28.1 Build message composition UI
    - Create recipient phone number input with validation
    - Add message text area with character count
    - Implement message template library
    - Add send confirmation dialog
    - _Requirements: 15.1, 15.2, 15.4_
    - Status: added admin compose module at `/admin/messages` with +243 phone normalization/validation, text area with live character countdown, predefined template library, and client-side confirmation before send.
  
  - [x] 28.2 Implement message sending functionality
    - Integrate with Meta WhatsApp API for custom messages
    - Log sent messages in messages_log table
    - Display message history for each user
    - Handle send failures with retry options
    - _Requirements: 15.3, 15.5_
    - Status: implemented secured admin API route (`/api/admin/messages/send`) that calls Meta WhatsApp Cloud API, records successful sends in `messages_log`, writes send failures to `error_logs`, exposes recipient-filtered message history on `/admin/messages`, and provides "Retry last failure" action in the UI.

- [x] 29. Create dashboard and monitoring views
  - [x] 29.1 Build metrics dashboard
    - Display transaction counts by status (24h, 7d, 30d)
    - Show GMV and revenue metrics
    - Display average completion time
    - Show failure rate percentage
    - _Requirements: Dashboard specifications_
    - Status: added `/admin/dashboard` metrics table covering 24h/7d/30d windows with counts-by-status, GMV, Clairtus revenue, average completion time, and failure-rate percentage derived from transaction data.
  
  - [x] 29.2 Implement float balance monitoring
    - Display current PawaPay wallet balances
    - Show balance alerts (warning/critical indicators)
    - Add manual balance refresh functionality
    - Display 24h payout volume and projections
    - _Requirements: 23.1, 23.2, 23.4, 23.5_
    - Status: implemented float monitoring service (`admin-panel/src/lib/floatMonitoring.ts`), secured API endpoint (`/api/admin/monitoring/float`), and dashboard monitor card with alert level badges, wallet balance table, 24h payout volume, projection/cover stats, and manual refresh action.
  
  - [x] 29.3 Create error log viewer
    - Display error logs with filtering capabilities
    - Allow marking errors as resolved
    - Provide export functionality
    - Group errors by type and frequency
    - _Requirements: Error log specifications_
    - Status: added `/admin/errors` viewer with filters (type, resolved state, date range), grouped frequency summary by error type, per-record resolve action, and CSV export endpoint at `/api/admin/errors/export`.

### Phase 7: Testing & Quality Assurance

- [ ] 30. Write comprehensive unit tests
  - [ ]* 30.1 Test fee calculation functions
    - Test correct fee calculations for various amounts
    - Test minimum/maximum amount enforcement
    - Test rounding to 2 decimal places
    - _Requirements: 21.1, 21.2, 21.6_
  
  - [ ]* 30.2 Test phone number normalization
    - Test all supported phone number formats
    - Test invalid format rejection
    - Test E.164 output format consistency
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_
  
  - [ ]* 30.3 Test PIN generation and validation
    - Test cryptographic randomness of PIN generation
    - Test constant-time comparison for security
    - Test attempt limiting logic
    - _Requirements: PIN security_
  
  - [ ]* 30.4 Test state machine transitions
    - Test all valid state transitions
    - Test invalid transition rejection
    - Test state transition atomicity
    - _Requirements: State machine specification_

- [ ] 31. Implement integration tests
  - [ ]* 31.1 Test complete transaction flows
    - Test happy path from initiation to completion
    - Test rejection and cancellation flows
    - Test PIN failure and lockout scenarios
    - Test TTL expiration handling
    - _Requirements: Complete workflow testing_
  
  - [ ]* 31.2 Test webhook processing
    - Test Meta webhook signature validation
    - Test PawaPay webhook signature validation
    - Test webhook idempotency handling
    - Test webhook retry scenarios
    - _Requirements: 12.1, 12.2, 27.1, 27.2, 27.3, 27.4_
  
  - [ ]* 31.3 Test error handling scenarios
    - Test PawaPay API error responses
    - Test Meta API error responses
    - Test database connection failures
    - Test network timeout scenarios
    - _Requirements: Error handling specifications_

- [ ] 32. Perform load and security testing
  - [ ]* 32.1 Execute load testing
    - Test sustained load (100 transactions/minute)
    - Test spike load (500 transactions/minute)
    - Test webhook processing under load
    - Verify performance SLAs are met
    - _Requirements: Performance requirements_
  
  - [ ]* 32.2 Conduct security testing
    - Test webhook signature validation
    - Test rate limiting enforcement
    - Test SQL injection prevention
    - Test unauthorized access prevention
    - _Requirements: Security architecture_

### Phase 8: Deployment & Production Setup

- [ ] 33. Configure production environment
  - [ ] 33.1 Set up production Supabase project
    - Create production Supabase project
    - Run all database migrations
    - Configure production environment variables
    - Set up database backups and monitoring
    - _Requirements: Deployment architecture_
  
  - [ ] 33.2 Deploy Edge Functions to production
    - Deploy all webhook and CRON functions
    - Configure production API endpoints
    - Test webhook connectivity from external services
    - Verify function performance and error handling
    - _Requirements: Production deployment_

- [ ] 34. Configure external service integrations
  - [ ] 34.1 Set up Meta WhatsApp production integration
    - Configure production WhatsApp Business Account
    - Set webhook URL to production endpoint
    - Verify webhook signature validation
    - Test message sending and receiving
    - _Requirements: Meta API integration_
  
  - [ ] 34.2 Set up PawaPay production integration
    - Configure production PawaPay credentials
    - Set webhook URL to production endpoint
    - Test deposit, payout, and refund flows
    - Verify balance monitoring functionality
    - _Requirements: PawaPay integration_

- [ ] 35. Deploy admin panel to production
  - Deploy Next.js admin panel to Vercel
  - Configure production environment variables
  - Set up Supabase Auth for production
  - Test all admin panel functionality
  - Configure monitoring and error tracking
  - _Requirements: Admin panel deployment_

- [ ] 36. Set up monitoring and alerting
  - [ ] 36.1 Configure error tracking
    - Set up Sentry for error monitoring
    - Configure error alerts for critical issues
    - Set up log aggregation and analysis
    - _Requirements: Monitoring and alerting_
  
  - [ ] 36.2 Set up business metrics monitoring
    - Configure transaction volume alerts
    - Set up float balance monitoring alerts
    - Create performance monitoring dashboards
    - Set up uptime monitoring for all endpoints
    - _Requirements: System health monitoring_

- [ ] 37. Final checkpoint - Production readiness verification
  - Ensure all tests pass and performance meets SLAs
  - Verify all security measures are in place
  - Confirm all monitoring and alerting is functional
  - Conduct final end-to-end testing in production environment
  - Ask the user if questions arise before going live

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP deployment
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout development
- All code examples use TypeScript as specified in the design document
- Database migrations should be run in sequential order
- Environment variables must be configured before deploying functions
- Testing should be performed in sandbox environments before production
- Admin panel provides manual intervention capabilities for edge cases
- CRON jobs handle automated system maintenance and recovery
- Security measures include webhook validation, rate limiting, and RLS policies