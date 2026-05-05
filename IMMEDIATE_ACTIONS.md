# ⚡ IMMEDIATE ACTIONS REQUIRED
## Critical Fixes to Deploy ASAP

**Priority**: 🔴 **CRITICAL**  
**Time Required**: 2 hours  
**Impact**: Unblocks production deployment

---

## ✅ ACTION 1: Fix REFUNDED State (10 minutes)

### Step 1: Apply Database Migration
```bash
cd /Users/cash/clairtus-mvp
supabase db push
```

**File**: `supabase/migrations/015_add_refunded_status.sql` ✅ Created

### Step 2: Update State Machine Enum
**File**: `supabase/functions/state-machine/index.ts`

Add to enum:
```typescript
export enum TransactionStatus {
  INITIATED = "INITIATED",
  PENDING_FUNDING = "PENDING_FUNDING",
  SECURED = "SECURED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",  // ADD THIS LINE
  PIN_FAILED_LOCKED = "PIN_FAILED_LOCKED",
  PAYOUT_FAILED = "PAYOUT_FAILED",
  PAYOUT_DELAYED = "PAYOUT_DELAYED",
}
```

### Step 3: Update Transition Matrix
Add to TRANSITION_MATRIX:
```typescript
[TransactionStatus.PAYOUT_FAILED]: {
  [StateEvent.REFUND_COMPLETED]: TransactionStatus.REFUNDED,  // Change from CANCELLED
},
[TransactionStatus.PIN_FAILED_LOCKED]: {
  [StateEvent.REFUND_COMPLETED]: TransactionStatus.REFUNDED,  // Change from CANCELLED
},
[TransactionStatus.REFUNDED]: {},  // ADD THIS - Terminal state
```

### Step 4: Update TTL Cron
**File**: `supabase/functions/cron-jobs/ttl-enforcement/index.ts`

Change line 107:
```typescript
// OLD:
.update({ status: "CANCELLED" })

// NEW:
.update({ status: "REFUNDED" })
```

Change line 120:
```typescript
// OLD:
old_status: "SECURED",
new_status: "CANCELLED",

// NEW:
old_status: "SECURED",
new_status: "REFUNDED",
```

### Step 5: Deploy
```bash
supabase functions deploy state-machine
supabase functions deploy cron-jobs/ttl-enforcement
```

**Time**: 10 minutes  
**Status**: ⬜ Not Started

---

## ✅ ACTION 2: Add Webhook Idempotency (1 hour)

### Step 1: Create Migration
**File**: `supabase/migrations/016_create_processed_webhooks.sql`

```sql
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id VARCHAR(255) NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id, event_type)
);

CREATE INDEX idx_processed_webhooks_lookup 
ON public.processed_webhooks(webhook_id, event_type);

CREATE INDEX idx_processed_webhooks_transaction 
ON public.processed_webhooks(transaction_id);

COMMENT ON TABLE public.processed_webhooks IS 
'Tracks processed webhook events to prevent duplicate processing';
```

### Step 2: Update PawaPay Webhook
**File**: `supabase/functions/pawapay-webhook/index.ts`

Add at the beginning of webhook processing:
```typescript
// Extract webhook ID (PawaPay sends this in headers or body)
const webhookId = request.headers.get('x-webhook-id') || 
                  body.depositId || 
                  body.payoutId || 
                  body.refundId;

if (!webhookId) {
  return jsonResponse({ error: 'Missing webhook ID' }, 400);
}

// Check if already processed
const supabase = createServiceRoleClient();
const { data: existing } = await supabase
  .from('processed_webhooks')
  .select('id')
  .eq('webhook_id', webhookId)
  .eq('event_type', eventType)
  .maybeSingle();

if (existing) {
  console.log(`⚠️ Duplicate webhook detected: ${webhookId}`);
  return jsonResponse({ 
    ok: true, 
    duplicate: true,
    message: 'Webhook already processed' 
  }, 200);
}

// Process webhook...
// [existing code]

// After successful processing, mark as processed
await supabase.from('processed_webhooks').insert({
  webhook_id: webhookId,
  transaction_id: transactionId,
  event_type: eventType,
  payload: body
});
```

### Step 3: Deploy
```bash
supabase db push
supabase functions deploy pawapay-webhook
```

**Time**: 1 hour  
**Status**: ⬜ Not Started

---

## ✅ ACTION 3: Add Payment Validation (30 minutes)

### Update PawaPay Webhook
**File**: `supabase/functions/pawapay-webhook/index.ts`

Add after transaction lookup:
```typescript
// Validate payment amount
const expectedAmount = transaction.base_amount;
const receivedAmount = parseFloat(depositData.amount);
const tolerance = 0.01; // 1 cent tolerance for rounding

if (Math.abs(receivedAmount - expectedAmount) > tolerance) {
  await supabase.from('error_logs').insert({
    transaction_id: transaction.id,
    error_type: 'PAYMENT_AMOUNT_MISMATCH',
    error_message: `Expected ${expectedAmount} USD, received ${receivedAmount} USD`,
    error_details: { 
      expected: expectedAmount, 
      received: receivedAmount,
      deposit_id: depositData.depositId 
    }
  });
  
  // Flag for manual review
  await supabase.from('transactions').update({
    requires_human: true
  }).eq('id', transaction.id);
  
  // Notify support
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText: `⚠️ Montant incorrect détecté.\n\nAttendu: ${expectedAmount}$\nReçu: ${receivedAmount}$\n\nUn agent va vérifier.`
  });
  
  return jsonResponse({ 
    ok: true, 
    held: true,
    reason: 'Amount mismatch - flagged for review' 
  }, 200);
}

// Validate payer phone (if available in webhook)
if (depositData.payer?.phone) {
  const payerPhone = normalizeDrPhoneToE164(depositData.payer.phone);
  
  if (payerPhone.ok && payerPhone.value !== transaction.buyer_phone) {
    await supabase.from('error_logs').insert({
      transaction_id: transaction.id,
      error_type: 'PAYMENT_PHONE_MISMATCH',
      error_message: `Expected ${transaction.buyer_phone}, received ${payerPhone.value}`,
      error_details: { 
        expected: transaction.buyer_phone, 
        received: payerPhone.value,
        deposit_id: depositData.depositId 
      }
    });
    
    // Flag for manual review
    await supabase.from('transactions').update({
      requires_human: true
    }).eq('id', transaction.id);
    
    // Notify support
    await sendWhatsAppTextMessage({
      recipientPhoneE164: transaction.buyer_phone,
      transactionId: transaction.id,
      messageText: `⚠️ Paiement reçu d'un autre numéro.\n\nUn agent va vérifier.`
    });
    
    return jsonResponse({ 
      ok: true, 
      held: true,
      reason: 'Phone mismatch - flagged for review' 
    }, 200);
  }
}
```

### Deploy
```bash
supabase functions deploy pawapay-webhook
```

**Time**: 30 minutes  
**Status**: ⬜ Not Started

---

## ✅ ACTION 4: Test Critical Flows (20 minutes)

### Run Tests
```bash
# Test refund flow
./supabase/tests/run_e2e.sh

# Test full suite
./supabase/tests/run_test_suite.sh
```

### Manual Verification
1. Create transaction
2. Buyer pays
3. Trigger refund
4. Verify status = REFUNDED (not CANCELLED)
5. Verify refund webhook processed
6. Test duplicate webhook (should be ignored)
7. Test wrong amount (should be flagged)

**Time**: 20 minutes  
**Status**: ⬜ Not Started

---

## 📋 CHECKLIST

### Database
- [ ] Apply migration 015 (REFUNDED status)
- [ ] Apply migration 016 (processed_webhooks)
- [ ] Verify migrations applied successfully

### Code Updates
- [ ] Update state machine enum
- [ ] Update transition matrix
- [ ] Update TTL cron
- [ ] Add webhook idempotency
- [ ] Add payment validation

### Deployment
- [ ] Deploy state-machine function
- [ ] Deploy ttl-enforcement cron
- [ ] Deploy pawapay-webhook function
- [ ] Verify all functions deployed

### Testing
- [ ] Run E2E test suite
- [ ] Manual refund test
- [ ] Duplicate webhook test
- [ ] Wrong amount test
- [ ] Verify all tests pass

### Documentation
- [ ] Update state diagram
- [ ] Update flow matrix
- [ ] Update test coverage report

---

## ⏱️ TIME ESTIMATE

| Action | Time | Priority |
|--------|------|----------|
| Fix REFUNDED state | 10 min | 🔴 CRITICAL |
| Add idempotency | 60 min | 🔴 CRITICAL |
| Add payment validation | 30 min | 🔴 CRITICAL |
| Test critical flows | 20 min | 🔴 CRITICAL |
| **TOTAL** | **2 hours** | - |

---

## 🚀 DEPLOYMENT COMMANDS

```bash
# 1. Apply migrations
cd /Users/cash/clairtus-mvp
supabase db push

# 2. Deploy functions
supabase functions deploy state-machine
supabase functions deploy cron-jobs/ttl-enforcement
supabase functions deploy pawapay-webhook

# 3. Run tests
./supabase/tests/run_e2e.sh
./supabase/tests/run_test_suite.sh

# 4. Verify deployment
supabase functions list
supabase db remote commit
```

---

## ✅ SUCCESS CRITERIA

After completing these actions:

1. ✅ REFUNDED state exists in database
2. ✅ Refund flow works end-to-end
3. ✅ Duplicate webhooks are ignored
4. ✅ Wrong amounts are flagged
5. ✅ All critical tests pass
6. ✅ No database errors
7. ✅ Functions deployed successfully

---

**Start Time**: ___________  
**End Time**: ___________  
**Status**: ⬜ Not Started → 🟡 In Progress → ✅ Complete

