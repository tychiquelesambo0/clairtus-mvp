# Clairtus WhatsApp MVP Master Test Suite

Purpose: run a production-readiness UAT from WhatsApp, covering happy paths, edge cases, failure recovery, abuse paths, and overlooked scenarios.

Scope: this suite is based on the current requirements/design for the escrow state machine (`INITIATED`, `PENDING_FUNDING`, `SECURED`, `COMPLETED`, `CANCELLED`, `PIN_FAILED_LOCKED`, `PAYOUT_FAILED`, `PAYOUT_DELAYED`, `HUMAN_SUPPORT`).

---

## 1) Test Setup (Do This First)

- Use at least 4 real WhatsApp numbers:
  - `V1` vendor primary
  - `B1` buyer primary
  - `V2` vendor secondary
  - `B2` buyer secondary
- Have at least 1 admin logged in to Admin Panel for observation/intervention.
- Keep one shared log sheet with columns:
  - `Test ID`, `Pass/Fail`, `Observed bot response`, `Observed delay`, `Unexpected behavior`, `Transaction ID (if shown/found)`.
- For long timers (24h/72h), run either:
  - true-duration tests in prod-like env, or
  - accelerated/staging timer config (recommended for fast iteration).
- Create a pre-UAT `limits baseline` sheet (must be signed off by Ops/Compliance) with:
  - BCC maximum total debit per transaction (fee-inclusive cap charged to buyer).
  - MNO-specific caps per operator (collection and payout constraints if different).
  - Derived maximum `base_amount` accepted by parser for each operator profile.
  - Current MNO fee assumption used for cap math (default in MVP: 1.5%).
- Use the `lowest effective cap` rule for go/no-go:
  - the system must enforce the strictest limit among internal config, BCC cap, and selected MNO cap.

---

## 2) Expected Command Formats (Reference)

- Vendor-initiated: `Vente [Montant] USD [Article] au [Numéro]`
- Buyer-initiated: `Achat [Montant] USD [Article] au [Numéro]`
- Support intents: `AIDE`, `Aide`, `Help`, `Support`
- Cancel intent: `ANNULER`
- PIN input: exactly 4 digits

---

## 3) Happy Paths (Core Money Flow)

### HP-01 Vendor-initiated full success
- Steps:
  1. `V1` sends valid `Vente ... USD ... au 0XXXXXXXXX` targeting `B1`.
  2. `B1` clicks `ACCEPTER`.
  3. Buyer completes payment from PawaPay link.
  4. `V1` submits correct 4-digit PIN received from `B1`.
- Expected:
  - Counterparty receive acceptance buttons with trust score.
  - Buyer receives secure payment link.
  - After deposit success: buyer gets PIN + warning, vendor gets "fonds securises".
  - After correct PIN: vendor payout success message, buyer completion message.
  - Final state: `COMPLETED`.

### HP-02 Buyer-initiated full success
- Same as HP-01 but initiated by `B1` using `Achat ...`.
- Expected final state: `COMPLETED`.

### HP-03 Text fallback accept
- Steps: in INITIATED, counterparty sends `Accepter` text (no button click).
- Expected: equivalent to `ACCEPTER`, state becomes `PENDING_FUNDING`.

### HP-04 Text fallback reject
- Steps: in INITIATED, counterparty sends `Refuser`.
- Expected: transaction cancelled, both parties informed.

### HP-05 Text fallback help
- Steps: user sends `Help` during active flow.
- Expected: support ack + automation halted (`HUMAN_SUPPORT` / `requires_human=true` behavior).

---

## 4) Parser + Input Validation Matrix

### Currency and amount
- IN-01 `CDF` currency rejected.
  - Expected: "Clairtus accepte uniquement USD..."
- IN-02 lower bound `0.99 USD`.
  - Expected: rejected minimum amount.
- IN-03 exact minimum `1 USD`.
  - Expected: accepted.
- IN-04 exact effective maximum `base_amount` from limits baseline.
  - Expected: accepted.
  - Example with 1.5% MNO fee and 2500 total debit cap: `2463.05` accepted because total debit rounds to `2500.00`.
- IN-05 `base_amount` exceeding effective maximum by `0.01`.
  - Expected: rejected maximum amount.
  - Example with above profile: `2463.06` rejected.
- IN-06 non-numeric amount (`abc`).
  - Expected: invalid format guidance.
- IN-07 decimal with 1 place (`10.5`).
  - Expected: accepted and rounded fee logic downstream.
- IN-08 decimal with 2 places (`10.55`).
  - Expected: accepted.
- IN-09 decimal with 3 places (`10.555`).
  - Expected: reject or normalize consistently (flag if inconsistent).

### Phone normalization
- IN-10 target phone `0XXXXXXXXX` (10 digits).
  - Expected: accepted and normalized to `+243...`.
- IN-11 target phone with spaces/dashes/parentheses.
  - Expected: cleaned + normalized.
- IN-12 target phone starts with `243XXXXXXXXX`.
  - Expected: normalized to `+243...`.
- IN-13 already in `+243XXXXXXXXX`.
  - Expected: accepted as-is.
- IN-14 too short.
  - Expected: invalid phone message.
- IN-15 too long.
  - Expected: invalid phone message.
- IN-16 non-DRC number (`+250...`, etc.).
  - Expected: invalid/rejected.

### Structure and wording tolerance
- IN-17 extra spaces between tokens.
  - Expected: still parsed.
- IN-18 lowercase verb (`vente`, `achat`).
  - Expected: parsed (case-insensitive).
- IN-19 swapped token order.
  - Expected: invalid format.
- IN-20 missing `au [numero]`.
  - Expected: invalid format.
- IN-21 empty article.
  - Expected: invalid format.
- IN-22 article >200 chars.
  - Expected: accepted with truncation; no crash.
- IN-23 emoji in article.
  - Expected: accepted or safely rejected; no malformed flow.
- IN-24 special chars (`/ \ ' " ;`).
  - Expected: no parser crash, no broken messages.

---

## 5) INITIATED State Behavior

- ST-01 counterparty sees trust score format for existing user.
- ST-02 counterparty sees "new user" trust score for first-time user.
- ST-03 counterparty clicks `REFUSER`.
  - Expected: `CANCELLED`, initiator notified.
- ST-04 initiator sends `ANNULER` while INITIATED.
  - Expected: `CANCELLED`, both notified.
- ST-05 counterparty sends `Oui` text.
  - Expected: same as accept.
- ST-06 unrelated text in INITIATED (`Salut`, random sentence).
  - Expected: no illegal transition; helpful guidance or ignore.
- ST-07 delayed response after long inactivity (near timeout boundary).
  - Expected: deterministic behavior, no duplicate tx.
- ST-08 timeout cancellation (24h initiation timeout).
  - Expected: auto-cancel + correct notification.

---

## 6) PENDING_FUNDING Behavior

- PF-01 after accept, buyer receives funding URL once.
- PF-02 buyer clicks funding URL and pays successfully.
  - Expected: transitions to `SECURED`.
- PF-03 buyer does not pay (timeout path).
  - Expected: auto-cancel around 30 min, both notified.
- PF-04 buyer sends `ANNULER` before payment success.
  - Expected: cancelled.
- PF-05 vendor sends `ANNULER` in pending funding.
  - Expected: cancelled.
- PF-06 support request `AIDE` in pending funding.
  - Expected: human support escalation.
- PF-07 duplicate accept action (button pressed again / repeated text).
  - Expected: idempotent, no duplicate deposit links/transactions.
- PF-08 random message from non-party number referencing flow.
  - Expected: ignored/rejected safely.
- PF-09 deposit request respects fee-inclusive debit cap.
  - Expected: amount sent to funding/deposit flow never exceeds baseline BCC/MNO total cap after adding MNO fee.
- PF-10 simulate provider-side collection limit rejection (if available in sandbox).
  - Expected: buyer receives clear retry/support guidance, transaction stays consistent (no illegal transition, no duplicate tx).

---

## 7) SECURED + PIN + Completion

- SC-01 on secure, buyer receives PIN and explicit phone-scam warning.
- SC-02 on secure, vendor receives delivery-and-request-pin instruction.
- SC-03 vendor sends correct PIN first attempt.
  - Expected: payout trigger then completion messages.
- SC-04 vendor sends wrong PIN once.
  - Expected: attempt count `(1/3)`.
- SC-05 vendor sends wrong PIN twice.
  - Expected: `(2/3)`.
- SC-06 vendor sends wrong PIN third time.
  - Expected: lock to `PIN_FAILED_LOCKED`; both sides alerted.
- SC-07 vendor sends non-4-digit (`123`, `12345`, `12ab`).
  - Expected: format invalid guidance; no attempt increment if spec says format invalid.
- SC-08 buyer sends PIN to bot instead of vendor.
  - Expected: no unauthorized release.
- SC-09 wrong vendor (another number) sends correct PIN.
  - Expected: ignored/rejected; no payout.
- SC-10 vendor sends PIN after transaction already completed.
  - Expected: no state regression; safe message.
- SC-11 vendor sends `ANNULER` while SECURED.
  - Expected: rejected with "transaction en cours, utilisez AIDE".
- SC-12 buyer sends `ANNULER` while SECURED.
  - Expected: same rejection.

---

## 8) Payout Failure + Recovery Paths

### Wallet limit path
- PY-01 induce/observe `RECEIVER_LIMIT_EXCEEDED`.
  - Expected: `PAYOUT_FAILED`; vendor gets retry prompt/button.
- PY-02 vendor clicks retry and succeeds.
  - Expected: `COMPLETED`.
- PY-03 retry fails repeatedly to max threshold.
  - Expected: escalates to human support.
- PY-04 vendor sends text equivalent for retry (if supported).
  - Expected: behaves same as retry button or explicit guidance.
- PY-10 operator-specific payout caps.
  - Steps: run same payout test on each enabled MNO profile in baseline sheet.
  - Expected: limit-induced failures consistently map to `PAYOUT_FAILED` with actionable message; successful retries complete without double payout.

### Network timeout path
- PY-05 induce payout timeout / 503.
  - Expected: `PAYOUT_DELAYED` + reassuring vendor message.
- PY-06 auto-retry CRON succeeds.
  - Expected: completion notices, final `COMPLETED`.
- PY-07 remains delayed beyond threshold (24h).
  - Expected: escalates to `HUMAN_SUPPORT`.

### Idempotency and duplication
- PY-08 duplicate payout webhook/event.
  - Expected: no double payout, no duplicated success messages.
- PY-09 repeated correct PIN sends while payout processing.
  - Expected: idempotent single payout.

---

## 9) TTL, Refunds, and Cancellation Correctness

- TT-01 INITIATED expires at 24h without acceptance.
  - Expected: `CANCELLED`.
- TT-02 SECURED expires at 72h without PIN completion.
  - Expected: refund base amount only, notify both parties with TTL messaging.
- TT-03 verify buyer messaging says MNO fee non-refundable.
- TT-04 verify vendor cancellation-fault messaging for TTL expiry.
- TT-05 duplicate expiry job runs.
  - Expected: no duplicate refunds/messages.
- TT-06 cancel command after terminal state (`CANCELLED`/`COMPLETED`).
  - Expected: no new transition.

---

## 10) Human Support and Automation Halt

- HS-01 `AIDE` in INITIATED.
- HS-02 `Aide` in PENDING_FUNDING.
- HS-03 `Support` in SECURED.
- HS-04 AIDE button click (interactive).
- HS-05 after escalation, user tries normal flow commands (`ANNULER`, PIN, accept text).
  - Expected: automation halted; no automatic progression.
- HS-06 admin resolves with force payout.
  - Expected: completion messages and terminal state.
- HS-07 admin resolves with force refund.
  - Expected: cancellation/refund messaging.
- HS-08 admin clears support flag to resume automation.
  - Expected: deterministic resume behavior, no corruption.

---

## 11) Abuse Prevention and Suspension

- AB-01 one user initiates >5 transactions within 1 hour.
  - Expected: rate limit rejection on excess attempts.
- AB-02 rate limit resets after 1 hour.
  - Expected: initiation allowed again.
- AB-03 user accumulates 3 locked PIN incidents.
  - Expected: account suspension path triggered.
- AB-04 suspended user tries new transaction.
  - Expected: suspension rejection message.
- AB-05 admin unsuspends user.
  - Expected: user can initiate again.

---

## 12) Multi-Transaction and Concurrency (Overlooked but Critical)

- CC-01 same buyer and vendor open two transactions in parallel.
  - Expected: each flow stays bound to correct transaction context.
- CC-02 vendor receives two secure transactions and sends one PIN.
  - Expected: PIN applies only to intended transaction.
- CC-03 old button click from prior transaction message.
  - Expected: ignored or mapped safely; no wrong transition.
- CC-04 both parties send conflicting actions at near-same time (accept/refuse or cancel/accept).
  - Expected: single deterministic winner; no split-brain status.
- CC-05 duplicate inbound user message retries (WhatsApp retransmission).
  - Expected: no duplicate tx creation.
- CC-06 duplicate webhooks (Meta/PawaPay).
  - Expected: idempotent processing.

---

## 13) Message Delivery and UX Robustness

- UX-01 all required French messages are understandable and complete.
- UX-02 no internal IDs/secrets leaked in user-facing text.
- UX-03 button labels are within WhatsApp limits and render correctly.
- UX-04 long article text does not break button message layout.
- UX-05 punctuation/emoji handling across Android and iPhone.
- UX-06 bot responses remain timely under normal load (<2-3s UX target).
- UX-07 when message send fails transiently, flow still consistent after retry.
- UX-08 user blocks bot mid-flow (if testable).
  - Expected: error logging/escalation without corrupting state.

---

## 14) Financial Correctness Spot Checks (User-Visible + Backoffice Verify)

- FN-01 For amount `100`, buyer charged `101.50`, vendor payout `97.50`.
- FN-02 For amount with decimals (`10.55`), verify 2-decimal rounding on fee outputs.
- FN-03 Refund after TTL returns base amount only.
- FN-04 No duplicate payouts on retried PIN/webhooks.
- FN-05 No payout when PIN wrong or unauthorized sender.
- FN-06 For each MNO profile in baseline, verify:
  - `buyer_total_debit = base_amount + mno_fee` never exceeds effective BCC/MNO cap.
  - parser boundary amount and provider acceptance/rejection are aligned (no contradiction between bot and MNO behavior).

---

## 15) “Never Events” (Must Never Happen)

- NV-01 Funds released without correct PIN (or approved admin override).
- NV-02 Funds released to wrong phone number.
- NV-03 Same transaction paid out twice.
- NV-04 Transaction jumps states illegally (e.g., INITIATED -> COMPLETED).
- NV-05 Support-escalated transaction continues automated flow anyway.
- NV-06 Wrong user can control another user’s transaction.
- NV-07 User can force CDF or non-USD through.
- NV-08 Broken parser causes silent no-response loops.

If any never-event occurs, treat as P0 blocker before launch.

---

## 16) Execution Packs (Recommended Run Order)

### Pack A - Smoke (go/no-go, ~45 min)
- HP-01, HP-02
- IN-01, IN-10, IN-14
- PF-03
- SC-03, SC-06
- HS-03
- AB-01
- NV-01..NV-04 quick sanity

### Pack B - Full Functional Regression
- All sections 3 to 14.

### Pack C - Chaos / Overlooked Scenarios
- CC-01..CC-06
- PY-08, PY-09
- UX-07, UX-08
- NV full sweep

---

## 17) Defect Report Format (Send Back Here)

For each failed test, report:

- `Test ID`:
- `WhatsApp number used`:
- `Input message/button pressed`:
- `Expected result`:
- `Actual result`:
- `Timestamp`:
- `Transaction ID` (if available from admin panel):
- `Severity` (`P0`, `P1`, `P2`):

This format will let me map failures directly to state machine logic and prepare targeted fixes quickly.

