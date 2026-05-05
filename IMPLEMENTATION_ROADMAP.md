# Clairtus Implementation Roadmap
## Path to 90% Test Coverage & Production Readiness

---

## Executive Summary

**Current Status**: 21% test coverage (8/38 scenarios)  
**Target**: 90% test coverage (34/38 scenarios)  
**Timeline**: 3 weeks  
**Critical Blockers**: 5 must-fix issues

---

## 🔴 WEEK 1: Critical Blockers (Must Fix)

### Day 1-2: Refund Flow Implementation

**Problem**: No refund mechanism exists  
**Impact**: Cannot handle cancellations after payment  
**Priority**: CRITICAL

**Tasks**:
1. Implement PawaPay refund API integration
2. Add `initiateRefund()` function in state machine
3. Create SECURED → REFUNDED transition
4. Add refund approval workflow (vendor/buyer)
5. Test refund webhook handling

**Files to Modify**:
- `supabase/functions/state-machine/index.ts`
- `supabase/functions/_shared/pawapay.ts`
- `supabase/functions/pawapay-webhook/index.ts`

**Test File**:
```typescript
// supabase/tests/test_refund_flows.ts
- test_VendorRefundFromSecured()
- test_BuyerRequestsRefund()
- test_AutoRefundAfterPayoutFailure()
- test_RefundWebhookHandling()
```

**Acceptance Criteria**:
- ✅ Vendor can initiate refund from SECURED state
- ✅ Buyer can request refund (requires vendor approval)
- ✅ PawaPay refund API called with correct parameters
- ✅ Refund webhook updates transaction to REFUNDED
- ✅ Both parties notified of refund status

---

### Day 3: Amount Limits Validation

**Problem**: No min/max amount checks  
**Impact**: Users can create $0 or $1M transactions  
**Priority**: CRITICAL

**Tasks**:
1. Add amount validation in `triggerCreateTransaction()`
2. Reject amounts < $1 or > $5000
3. Return clear error messages
4. Test boundary conditions

**Files to Modify**:
- `supabase/functions/state-machine/index.ts`
- `supabase/functions/_shared/transactionLimits.ts`

**Test File**:
```typescript
// supabase/tests/test_limits_validation.ts
- test_AmountBelowMinimum() // $0.50
- test_AmountAboveMaximum() // $10,000
- test_AmountExactlyMinimum() // $1.00
- test_AmountExactlyMaximum() // $5000.00
- test_AmountWithDecimals() // $99.99
```

**Acceptance Criteria**:
- ✅ Transactions < $1 rejected with error message
- ✅ Transactions > $5000 rejected with error message
- ✅ Transactions at $1 and $5000 accepted
- ✅ Error messages in French and clear

---

### Day 4: Idempotency & Duplicate Prevention

**Problem**: Duplicate webhooks can double-credit payments  
**Impact**: Financial loss, double payments  
**Priority**: CRITICAL

**Tasks**:
1. Add idempotency key to PawaPay webhook handler
2. Check if deposit already processed
3. Prevent duplicate state transitions
4. Log duplicate webhook attempts

**Files to Modify**:
- `supabase/functions/pawapay-webhook/index.ts`
- Add `processed_webhooks` table for deduplication

**Test File**:
```typescript
// supabase/tests/test_idempotency.ts
- test_DuplicateDepositWebhook()
- test_DuplicatePayoutWebhook()
- test_DuplicateRefundWebhook()
- test_IdempotencyKeyValidation()
```

**Acceptance Criteria**:
- ✅ Duplicate deposit webhooks ignored
- ✅ Transaction state unchanged on duplicate
- ✅ Idempotency key logged in database
- ✅ No double-crediting of payments

---

### Day 5: Payment Amount Validation

**Problem**: No validation that payment matches transaction amount  
**Impact**: Buyer can pay wrong amount  
**Priority**: CRITICAL

**Tasks**:
1. Add amount validation in PawaPay deposit webhook
2. Compare webhook amount to transaction.base_amount
3. Reject mismatched payments
4. Initiate auto-refund for wrong amounts

**Files to Modify**:
- `supabase/functions/pawapay-webhook/index.ts`
- `supabase/functions/state-machine/index.ts`

**Test File**:
```typescript
// supabase/tests/test_payment_validation.ts
- test_PaymentAmountTooLow() // Paid $90, expected $100
- test_PaymentAmountTooHigh() // Paid $110, expected $100
- test_PaymentAmountExact() // Paid $100, expected $100
- test_AutoRefundWrongAmount()
```

**Acceptance Criteria**:
- ✅ Payments matching transaction amount accepted
- ✅ Payments with wrong amount rejected
- ✅ Auto-refund initiated for wrong amounts
- ✅ Both parties notified of mismatch

---

### Day 6-7: Timeout & Expiry System

**Problem**: No auto-cancel for abandoned transactions  
**Impact**: Stale transactions clog database  
**Priority**: CRITICAL

**Tasks**:
1. Create cron job for transaction expiry
2. Auto-cancel INITIATED transactions after 72h
3. Auto-cancel PENDING_FUNDING after 72h
4. Send 24h reminder before expiry
5. Notify both parties on expiry

**Files to Create**:
- `supabase/functions/transaction-expiry-cron/index.ts`

**Files to Modify**:
- `supabase.toml` (add cron schedule)

**Test File**:
```typescript
// supabase/tests/test_timeouts.ts
- test_InitiatedExpiryAfter72Hours()
- test_PendingFundingExpiryAfter72Hours()
- test_24HourReminder()
- test_ExpiryNotifications()
```

**Acceptance Criteria**:
- ✅ Cron runs every hour
- ✅ Transactions > 72h old auto-cancelled
- ✅ Reminders sent at 24h mark
- ✅ Both parties notified of expiry

---

## 🟡 WEEK 2: High Priority Features

### Day 8-9: Payout Retry Logic

**Problem**: PAYOUT_FAILED state exists but no retry mechanism  
**Impact**: Vendor stuck if payout fails  
**Priority**: HIGH

**Tasks**:
1. Add RÉESSAYER button in payout failed message
2. Implement retry logic in state machine
3. Track retry attempts (max 3)
4. Auto-refund after 3 failed retries

**Files to Modify**:
- `supabase/functions/state-machine/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`

**Test File**:
```typescript
// supabase/tests/test_payout_retry.ts
- test_PayoutFailsFirstAttempt()
- test_VendorRetriesSuccessfully()
- test_MaxRetryAttemptsReached()
- test_AutoRefundAfter3Failures()
```

**Acceptance Criteria**:
- ✅ RÉESSAYER button shown on payout failure
- ✅ Retry initiates new payout attempt
- ✅ Max 3 retries enforced
- ✅ Auto-refund after 3 failures

---

### Day 10-11: Guided Flow (VENDRE Command)

**Problem**: Guided flow exists but not tested  
**Impact**: Users may prefer step-by-step vs AI  
**Priority**: HIGH

**Tasks**:
1. Test VENDRE command flow
2. Validate multi-step conversation
3. Test validation at each step
4. Ensure smooth transition to transaction creation

**Test File**:
```typescript
// supabase/tests/test_guided_flow.ts
- test_VendreCommandFlow()
- test_GuidedAmountValidation()
- test_GuidedPhoneValidation()
- test_GuidedItemDescription()
- test_GuidedConfirmation()
```

**Acceptance Criteria**:
- ✅ VENDRE command triggers guided flow
- ✅ Bot asks for amount, item, phone in sequence
- ✅ Validation at each step
- ✅ Transaction created after confirmation

---

### Day 12: Buyer Cancellation in PENDING_FUNDING

**Problem**: Buyer may not be able to cancel after accepting  
**Impact**: Buyer stuck if changes mind  
**Priority**: HIGH

**Tasks**:
1. Verify buyer can cancel in PENDING_FUNDING
2. Add ANNULER button to buyer messages
3. Test cancellation permissions
4. Notify vendor of buyer cancellation

**Files to Modify**:
- `supabase/functions/state-machine/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`

**Test File**:
```typescript
// supabase/tests/test_buyer_cancellation.ts
- test_BuyerCancelsAfterAccepting()
- test_BuyerCancelsInPendingFunding()
- test_VendorNotifiedOfCancellation()
```

**Acceptance Criteria**:
- ✅ Buyer can cancel in PENDING_FUNDING
- ✅ Transaction moves to CANCELLED
- ✅ Vendor notified immediately

---

### Day 13-14: Concurrency & Multiple Transactions

**Problem**: Vendor with 2+ SECURED transactions → PIN ambiguous  
**Impact**: Wrong transaction may be completed  
**Priority**: HIGH

**Tasks**:
1. Add transaction reference to PIN submission
2. Disambiguate when multiple transactions active
3. Test concurrent transaction handling
4. Add transaction list command

**Files to Modify**:
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/state-machine/index.ts`

**Test File**:
```typescript
// supabase/tests/test_concurrency.ts
- test_VendorWithMultipleSecuredTransactions()
- test_PinSubmissionDisambiguation()
- test_ConcurrentWebhookHandling()
- test_TransactionListCommand()
```

**Acceptance Criteria**:
- ✅ Vendor can have multiple active transactions
- ✅ PIN submission specifies transaction reference
- ✅ Bot asks "Which transaction?" if ambiguous
- ✅ Concurrent webhooks handled safely

---

## 🟢 WEEK 3: Medium Priority & Polish

### Day 15-16: Human Support Workflow

**Problem**: `requires_human` flag exists but no workflow  
**Impact**: Support requests go nowhere  
**Priority**: MEDIUM

**Tasks**:
1. Test AIDE button flow
2. Verify automation halts
3. Create support notification system
4. Add support resolution workflow

**Test File**:
```typescript
// supabase/tests/test_human_support.ts
- test_VendorRequestsSupport()
- test_BuyerRequestsSupport()
- test_AutomationHalts()
- test_SupportNotification()
```

**Acceptance Criteria**:
- ✅ AIDE button sets requires_human flag
- ✅ Automation halts for transaction
- ✅ Support team notified
- ✅ User receives confirmation message

---

### Day 17: Relaunch Transaction (RELANCER)

**Problem**: RELANCER command exists but not tested  
**Impact**: May have bugs in production  
**Priority**: MEDIUM

**Tasks**:
1. Test RELANCER command
2. Verify buyer phone prefill
3. Test with valid and invalid references
4. Ensure new transaction created correctly

**Test File**:
```typescript
// supabase/tests/test_relaunch.ts
- test_RelancerWithValidReference()
- test_RelancerWithInvalidReference()
- test_BuyerPhonePrefilled()
- test_NewTransactionCreated()
```

**Acceptance Criteria**:
- ✅ RELANCER CLT-XXXXXX prefills buyer phone
- ✅ Invalid references rejected gracefully
- ✅ New transaction created with same buyer
- ✅ Vendor provides new amount and item

---

### Day 18: Payment from Different Number

**Problem**: No phone validation in payment webhook  
**Impact**: Security risk, fraud potential  
**Priority**: MEDIUM

**Tasks**:
1. Add phone number validation in PawaPay webhook
2. Compare payment phone to buyer phone
3. Flag mismatches for manual review
4. Hold payment if phone mismatch

**Files to Modify**:
- `supabase/functions/pawapay-webhook/index.ts`

**Test File**:
```typescript
// supabase/tests/test_phone_validation.ts
- test_PaymentFromCorrectNumber()
- test_PaymentFromDifferentNumber()
- test_PhoneMismatchFlagged()
- test_ManualReviewRequired()
```

**Acceptance Criteria**:
- ✅ Payment from correct number accepted
- ✅ Payment from different number flagged
- ✅ Manual review triggered
- ✅ Support team notified

---

### Day 19: AI Timeout & Fallback

**Problem**: AI timeout fallback not tested  
**Impact**: Users may get no response  
**Priority**: MEDIUM

**Tasks**:
1. Test AI extraction timeout
2. Verify fallback to guided mode
3. Test graceful degradation
4. Ensure user not left hanging

**Test File**:
```typescript
// supabase/tests/test_ai_fallback.ts
- test_OpenAITimeout()
- test_FallbackToGuidedMode()
- test_UserNotifiedOfFallback()
- test_GracefulDegradation()
```

**Acceptance Criteria**:
- ✅ AI timeout triggers fallback
- ✅ User suggested to use VENDRE
- ✅ No silent failures
- ✅ Error logged for monitoring

---

### Day 20-21: Final Testing & Documentation

**Tasks**:
1. Run full test suite (all 34 tests)
2. Fix any remaining bugs
3. Update documentation
4. Create production deployment checklist
5. Security audit

**Deliverables**:
- ✅ 90% test coverage achieved
- ✅ All critical bugs fixed
- ✅ Documentation updated
- ✅ Production checklist complete

---

## Test File Structure

```
supabase/tests/
├── run_e2e.sh                      # Happy path runner
├── run_test_suite.sh               # Comprehensive suite runner
├── simulate_whatsapp_e2e.ts        # ✅ Happy path (DONE)
├── e2e_test_suite.ts               # ✅ 5 edge cases (DONE)
│
├── test_refund_flows.ts            # Week 1, Day 1-2
├── test_limits_validation.ts       # Week 1, Day 3
├── test_idempotency.ts             # Week 1, Day 4
├── test_payment_validation.ts      # Week 1, Day 5
├── test_timeouts.ts                # Week 1, Day 6-7
│
├── test_payout_retry.ts            # Week 2, Day 8-9
├── test_guided_flow.ts             # Week 2, Day 10-11
├── test_buyer_cancellation.ts      # Week 2, Day 12
├── test_concurrency.ts             # Week 2, Day 13-14
│
├── test_human_support.ts           # Week 3, Day 15-16
├── test_relaunch.ts                # Week 3, Day 17
├── test_phone_validation.ts        # Week 3, Day 18
├── test_ai_fallback.ts             # Week 3, Day 19
│
└── README.md                       # ✅ Testing guide (DONE)
```

---

## Success Metrics

### Week 1 Goals
- ✅ 5 critical blockers fixed
- ✅ 15 new tests added
- ✅ 50% test coverage achieved

### Week 2 Goals
- ✅ 4 high-priority features implemented
- ✅ 12 new tests added
- ✅ 75% test coverage achieved

### Week 3 Goals
- ✅ 4 medium-priority features implemented
- ✅ 9 new tests added
- ✅ 90% test coverage achieved
- ✅ Production ready

---

## Risk Mitigation

### Technical Risks
- **PawaPay API Changes**: Monitor API docs, version lock
- **OpenAI Rate Limits**: Implement caching, fallback to guided mode
- **Database Deadlocks**: Use proper transaction isolation
- **WhatsApp API Limits**: Implement rate limiting, queueing

### Business Risks
- **Refund Delays**: Set clear SLAs, auto-escalate after 24h
- **Fraud**: Implement phone validation, amount limits, velocity checks
- **Support Overload**: Build self-service tools, clear error messages

---

## Production Deployment Checklist

### Before Launch
- [ ] All 34 tests passing
- [ ] Security audit complete
- [ ] PawaPay production credentials configured
- [ ] Monitoring and alerting set up
- [ ] Support team trained
- [ ] Legal compliance verified (DRC regulations)
- [ ] Backup and disaster recovery tested

### Launch Day
- [ ] Deploy to production
- [ ] Run smoke tests
- [ ] Monitor error logs
- [ ] Watch transaction flow
- [ ] Support team on standby

### Post-Launch (Week 1)
- [ ] Daily test suite runs
- [ ] Monitor key metrics (completion rate, error rate)
- [ ] Gather user feedback
- [ ] Fix any production bugs
- [ ] Optimize based on real usage

---

**Timeline**: 3 weeks (21 days)  
**Team Size**: 1-2 developers  
**Estimated Effort**: 120-160 hours  
**Target Coverage**: 90% (34/38 scenarios)  
**Production Ready**: End of Week 3

