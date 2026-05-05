# Clairtus State Transition Map
## Complete State Machine with All Possible Transitions

---

## State Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRANSACTION LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   AI DRAFT   │
                              │  (temporary) │
                              └──────┬───────┘
                                     │
                          Vendor confirms "Oui"
                                     │
                                     ▼
                              ┌──────────────┐
                         ┌───▶│  INITIATED   │◀───┐
                         │    └──────┬───────┘    │
                         │           │            │
                         │    Buyer accepts       │
                         │           │            │
                         │           ▼            │
                         │    ┌──────────────┐   │
                         │    │   PENDING_   │   │
                         │    │   FUNDING    │   │
                         │    └──────┬───────┘   │
                         │           │            │
                         │    Payment received    │
                         │           │            │
                         │           ▼            │
                         │    ┌──────────────┐   │
                         │    │   SECURED    │   │
                         │    └──────┬───────┘   │
                         │           │            │
                         │    PIN validated       │
                         │           │            │
                         │           ▼            │
                         │    ┌──────────────┐   │
                         │    │  COMPLETED   │   │
                         │    └──────────────┘   │
                         │                        │
                    CANCELLED                     │
                    (anytime before               │
                     SECURED)                     │
                         │                        │
                         │                   REFUNDED
                         │                   (after SECURED,
                         │                    before COMPLETED)
                         │                        │
                         └────────────────────────┘


                    ┌──────────────┐
                    │  PAYOUT_     │◀── From SECURED
                    │  FAILED      │    (payout error)
                    └──────┬───────┘
                           │
                    Vendor retries
                           │
                           ▼
                    Back to SECURED
                    (retry payout)


                    ┌──────────────┐
                    │  PAYOUT_     │◀── From SECURED
                    │  DELAYED     │    (operator delay)
                    └──────┬───────┘
                           │
                    Webhook updates
                           │
                           ▼
                    COMPLETED


                    ┌──────────────┐
                    │  PIN_FAILED_ │◀── From SECURED
                    │  LOCKED      │    (3 wrong PINs)
                    └──────────────┘
                           │
                    Human support
                    required
```

---

## Transition Matrix

### From INITIATED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Buyer accepts | Buyer | PENDING_FUNDING | ✅ |
| Buyer rejects | Buyer | CANCELLED | ✅ |
| Vendor cancels | Vendor | CANCELLED | ✅ |
| 72h timeout | System | CANCELLED | ❌ |
| Human support | Either | INITIATED (frozen) | ❌ |

### From PENDING_FUNDING

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Payment received | System | SECURED | ✅ |
| Vendor cancels | Vendor | CANCELLED | ❌ |
| Buyer cancels | Buyer | CANCELLED | ❌ |
| 72h timeout | System | CANCELLED | ❌ |
| Payment fails | System | PENDING_FUNDING | ❌ |

### From SECURED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Correct PIN submitted | Vendor | COMPLETED | ✅ |
| Wrong PIN (3x) | Vendor | PIN_FAILED_LOCKED | ✅ |
| Payout fails | System | PAYOUT_FAILED | ❌ |
| Payout delayed | System | PAYOUT_DELAYED | ❌ |
| Vendor requests refund | Vendor | REFUNDED | ❌ |
| Buyer requests refund | Buyer | REFUNDED (needs vendor approval) | ❌ |

### From PAYOUT_FAILED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Vendor retries | Vendor | SECURED (retry) | ❌ |
| Vendor cancels | Vendor | REFUNDED | ❌ |
| Human support | Either | PAYOUT_FAILED (frozen) | ❌ |

### From PAYOUT_DELAYED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Payout completes | System | COMPLETED | ❌ |
| Payout fails | System | PAYOUT_FAILED | ❌ |

### From PIN_FAILED_LOCKED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| Human support unlocks | Support | SECURED | ❌ |
| Refund approved | Support | REFUNDED | ❌ |

### From CANCELLED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| None | - | TERMINAL STATE | ✅ |

### From REFUNDED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| None | - | TERMINAL STATE | ❌ |

### From COMPLETED

| Action | Actor | Next State | Tested? |
|--------|-------|------------|---------|
| None | - | TERMINAL STATE | ✅ |

---

## User Actions by State

### INITIATED State

**Vendor Can:**
- ❌ NOT TESTED: Cancel transaction (ANNULER button)
- ❌ NOT TESTED: Request human support (AIDE button)
- ❌ NOT TESTED: Relaunch to same buyer (RELANCER)

**Buyer Can:**
- ✅ TESTED: Accept transaction (ACCEPTER button)
- ✅ TESTED: Reject transaction (REFUSER button)
- ❌ NOT TESTED: Request human support (AIDE button)

**System Can:**
- ❌ NOT TESTED: Auto-cancel after 72h timeout
- ❌ NOT TESTED: Send reminder after 24h

---

### PENDING_FUNDING State

**Vendor Can:**
- ❌ NOT TESTED: Cancel transaction (ANNULER button)
- ❌ NOT TESTED: Request human support (AIDE button)

**Buyer Can:**
- ❌ NOT TESTED: Cancel transaction (ANNULER button)
- ❌ NOT TESTED: Submit payment proof (if webhook delayed)
- ❌ NOT TESTED: Request human support (AIDE button)

**System Can:**
- ✅ TESTED: Receive payment webhook → SECURED
- ❌ NOT TESTED: Auto-cancel after 72h timeout
- ❌ NOT TESTED: Send payment reminder after 24h

---

### SECURED State

**Vendor Can:**
- ✅ TESTED: Submit PIN (correct → COMPLETED)
- ✅ TESTED: Submit wrong PIN (3x → PIN_FAILED_LOCKED)
- ❌ NOT TESTED: Request refund (ANNULER → REFUNDED)
- ❌ NOT TESTED: Request human support (AIDE button)

**Buyer Can:**
- ❌ NOT TESTED: Request refund (needs vendor approval)
- ❌ NOT TESTED: Request human support (AIDE button)

**System Can:**
- ❌ NOT TESTED: Payout fails → PAYOUT_FAILED
- ❌ NOT TESTED: Payout delayed → PAYOUT_DELAYED
- ❌ NOT TESTED: Auto-refund after 7 days no PIN

---

### PAYOUT_FAILED State

**Vendor Can:**
- ❌ NOT TESTED: Retry payout (RÉESSAYER button)
- ❌ NOT TESTED: Cancel and refund buyer (ANNULER → REFUNDED)
- ❌ NOT TESTED: Request human support (AIDE button)

**Buyer Can:**
- ❌ NOT TESTED: Request refund
- ❌ NOT TESTED: Request human support (AIDE button)

**System Can:**
- ❌ NOT TESTED: Auto-retry payout (3 attempts)
- ❌ NOT TESTED: Auto-refund after 3 failed retries

---

### PAYOUT_DELAYED State

**Vendor Can:**
- ❌ NOT TESTED: View status (waiting for operator)
- ❌ NOT TESTED: Request human support (AIDE button)

**Buyer Can:**
- ❌ NOT TESTED: View status
- ❌ NOT TESTED: Request human support (AIDE button)

**System Can:**
- ❌ NOT TESTED: Poll PawaPay for status updates
- ❌ NOT TESTED: Complete when payout succeeds
- ❌ NOT TESTED: Fail if payout rejected

---

### PIN_FAILED_LOCKED State

**Vendor Can:**
- ❌ NOT TESTED: Contact human support (automatic)

**Buyer Can:**
- ❌ NOT TESTED: Request refund
- ❌ NOT TESTED: Contact human support

**System Can:**
- ❌ NOT TESTED: Notify support team
- ❌ NOT TESTED: Auto-refund after 48h no resolution

---

## Missing Functionality Analysis

### 🔴 CRITICAL GAPS

1. **Refund Flow** (SECURED → REFUNDED)
   - No code for initiating refunds
   - No PawaPay refund API integration
   - No refund approval workflow

2. **Amount Limits Validation**
   - No min/max checks in state machine
   - No rejection for amounts outside $1-$5000 range

3. **Payment Timeout Handling**
   - No auto-cancel after 72h in PENDING_FUNDING
   - No reminder system for unpaid transactions

4. **Idempotency for Webhooks**
   - PawaPay webhook may fire multiple times
   - No duplicate payment protection

5. **Concurrent Transaction Support**
   - No handling for vendor with multiple active transactions
   - PIN submission ambiguous if 2+ transactions SECURED

### 🟡 HIGH PRIORITY GAPS

6. **Payout Retry Logic**
   - PAYOUT_FAILED state exists but no retry mechanism
   - No retry button implementation

7. **Guided Flow (VENDRE Command)**
   - State machine exists but not tested
   - Multi-step conversation flow not validated

8. **Buyer Cancellation in PENDING_FUNDING**
   - State machine may not allow buyer to cancel after accepting
   - Need to verify cancellation permissions

9. **Wrong Amount Payment**
   - No validation that payment amount matches transaction amount
   - No auto-refund for incorrect amounts

10. **Human Support Workflow**
    - `requires_human` flag exists but no support dashboard
    - No way to resume automation after support resolves issue

### 🟢 MEDIUM PRIORITY GAPS

11. **Transaction Expiry (72h)**
    - No cron job to auto-cancel expired transactions
    - No expiry reminders

12. **Multiple Concurrent Transactions**
    - No transaction reference disambiguation
    - PIN submission doesn't specify which transaction

13. **Payment from Different Number**
    - No phone number validation in PawaPay webhook
    - Security risk if buyer pays from different account

14. **Relaunch Transaction (RELANCER)**
    - Code exists but not tested
    - May have bugs in buyer phone prefill

15. **AI Extraction Timeout**
    - 5-second timeout exists but fallback not tested
    - May leave user hanging with no response

---

## Test Coverage Recommendations

### Phase 1: Critical Tests (Week 1)

```bash
# Create these test files:
1. test_refund_flows.ts
   - Vendor refund from SECURED
   - Buyer refund request
   - Auto-refund scenarios

2. test_limits_validation.ts
   - Amount < $1 rejection
   - Amount > $5000 rejection
   - Edge case: exactly $1 and $5000

3. test_payment_edge_cases.ts
   - Wrong amount payment
   - Duplicate payment webhook
   - Payment from different number

4. test_timeouts.ts
   - 72h expiry in INITIATED
   - 72h expiry in PENDING_FUNDING
   - 24h reminder system
```

### Phase 2: High Priority Tests (Week 2)

```bash
5. test_payout_failures.ts
   - Payout fails → PAYOUT_FAILED
   - Retry button → back to SECURED
   - Auto-retry logic

6. test_guided_flow.ts
   - VENDRE command flow
   - Multi-step conversation
   - Validation at each step

7. test_cancellations.ts
   - Buyer cancels in PENDING_FUNDING
   - Vendor cancels in PENDING_FUNDING
   - Cancellation permissions by state

8. test_concurrency.ts
   - Multiple active transactions
   - PIN submission disambiguation
   - Race condition handling
```

### Phase 3: Medium Priority Tests (Week 3)

```bash
9. test_human_support.ts
   - AIDE button flow
   - Automation halt
   - Support resolution

10. test_relaunch.ts
    - RELANCER command
    - Buyer phone prefill
    - New transaction creation

11. test_ai_fallback.ts
    - OpenAI timeout
    - Fallback extraction
    - Guided mode suggestion
```

---

## Implementation Checklist

### Must Implement Before Production

- [ ] **Refund API Integration** (PawaPay refund endpoint)
- [ ] **Amount Limits Validation** (min $1, max $5000)
- [ ] **Idempotency Keys** (prevent duplicate payments)
- [ ] **Payment Amount Validation** (match transaction amount)
- [ ] **Timeout Cron Jobs** (72h auto-cancel)
- [ ] **Payout Retry Logic** (RÉESSAYER button)
- [ ] **Transaction Reference Disambiguation** (multiple active transactions)
- [ ] **Phone Number Validation** (payment from correct number)

### Should Implement Soon

- [ ] **Reminder System** (24h payment reminders)
- [ ] **Human Support Dashboard** (for `requires_human` flag)
- [ ] **Guided Flow Testing** (VENDRE command)
- [ ] **Buyer Cancellation** (in PENDING_FUNDING)
- [ ] **Auto-Refund Logic** (after failed payouts)

### Nice to Have

- [ ] **Transaction Expiry Reminders** (before 72h)
- [ ] **AI Timeout Fallback** (graceful degradation)
- [ ] **Relaunch Validation** (RELANCER command)
- [ ] **Rate Limit Handling** (WhatsApp API)

---

**Current State**: 8/38 scenarios tested (21%)  
**Target State**: 34/38 scenarios tested (90%)  
**Critical Gaps**: 5 must-fix issues before production  
**Estimated Work**: 3 weeks for full coverage

