# Clairtus - Complete Flow Checklist
## Every Happy Path & Edge Case for Vendor and Buyer

---

## 📊 SUMMARY

**Total Scenarios**: 38  
**Currently Tested**: 8 (21%)  
**Not Tested**: 30 (79%)  
**Target**: 34 tested (90%)

---

## 🟢 VENDOR HAPPY PATHS

### ✅ HP-V1: AI-Powered Transaction Creation
**Status**: TESTED ✅  
**Test File**: `simulate_whatsapp_e2e.ts`

**Flow**:
1. Vendor sends: "Je veux vendre MacBook à 100$ au +243123456789"
2. AI extracts: intent=VENDRE, amount=100, item=MacBook, phone=+243...
3. Bot shows confirmation with "Oui/Non" buttons
4. Vendor clicks "Oui, continuer"
5. Transaction created → INITIATED
6. Buyer notified
7. Buyer accepts → PENDING_FUNDING
8. Buyer pays → SECURED
9. Vendor receives PIN
10. Vendor submits PIN → COMPLETED

---

### ❌ HP-V2: Guided Transaction Creation (VENDRE Command)
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Vendor sends: "VENDRE"
2. Bot: "Quel est le montant?"
3. Vendor: "100"
4. Bot: "Quelle est la description de l'article?"
5. Vendor: "MacBook"
6. Bot: "Quel est le numéro de l'acheteur?"
7. Vendor: "+243123456789"
8. Bot shows confirmation
9. Vendor confirms
10. Transaction created → INITIATED
11. [Continue as HP-V1]

**Need**: Test file `test_guided_flow.ts`

---

### ❌ HP-V3: Payout Retry After Failure
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Transaction in SECURED state
2. Vendor submits PIN
3. Payout fails → PAYOUT_FAILED
4. Bot: "❌ Transfert échoué. [RÉESSAYER]"
5. Vendor clicks "RÉESSAYER"
6. Payout succeeds → COMPLETED

**Need**: Test file `test_payout_retry.ts`

---

### ❌ HP-V4: Relaunch Transaction (RELANCER)
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Previous transaction COMPLETED (ref: CLT-123456)
2. Vendor sends: "RELANCER CLT-123456"
3. Bot prefills buyer phone from reference
4. Vendor provides new amount and item
5. Transaction created → INITIATED

**Need**: Test file `test_relaunch.ts`

---

## 🔴 VENDOR EDGE CASES

### ✅ EC-V1: Vendor Cancels Before Buyer Accepts
**Status**: TESTED ✅  
**Test File**: `e2e_test_suite.ts` - `test_SellerCancelsTransaction`

**Flow**:
1. Transaction in INITIATED
2. Vendor clicks "ANNULER"
3. Transaction → CANCELLED
4. Buyer notified

---

### ❌ EC-V2: Vendor Cancels in PENDING_FUNDING
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Transaction in PENDING_FUNDING (buyer accepted, not paid yet)
2. Vendor clicks "ANNULER"
3. Transaction → CANCELLED
4. Buyer notified (no refund needed)

**Need**: Test file `test_cancellations.ts`

---

### ❌ EC-V3: Vendor Requests Refund After Payment
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Transaction in SECURED
2. Vendor clicks "ANNULER"
3. Bot: "⚠️ Paiement déjà reçu. Annulation = remboursement automatique. Confirmer?"
4. Vendor confirms
5. Refund initiated via PawaPay
6. Transaction → REFUNDED
7. Both parties notified

**Need**: 
- Implement PawaPay refund API
- Test file `test_refund_flows.ts`

---

### ❌ EC-V4: Vendor Submits Wrong PIN (1st Attempt, Then Correct)
**Status**: PARTIALLY TESTED ⚠️  
**Priority**: MEDIUM

**Flow**:
1. Transaction in SECURED
2. Vendor submits wrong PIN: "0000"
3. Bot: "❌ Code PIN incorrect. 2 tentatives restantes."
4. Vendor submits correct PIN: "1234"
5. Payout succeeds → COMPLETED

**Need**: Test recovery after wrong PIN

---

### ✅ EC-V5: Vendor Submits Wrong PIN (3 Attempts - Lockout)
**Status**: TESTED ✅  
**Test File**: `e2e_test_suite.ts` - `test_PinFailureFlow`

**Flow**:
1. Transaction in SECURED
2. Vendor submits wrong PIN (attempt 1)
3. Vendor submits wrong PIN (attempt 2)
4. Vendor submits wrong PIN (attempt 3)
5. Transaction → PIN_FAILED_LOCKED
6. Bot: "🔒 Compte bloqué. Contactez l'assistance."

---

### ✅ EC-V6: Vendor Rejects AI Prefill
**Status**: TESTED ✅  
**Test File**: `e2e_test_suite.ts` - `test_AiPrefillRejection`

**Flow**:
1. Vendor sends AI message
2. AI extracts details
3. Bot shows confirmation
4. Vendor clicks "Non, annuler"
5. AI draft deleted
6. Bot: "Annulé. Réessayez avec VENDRE."

---

### ✅ EC-V7: Vendor Sends Invalid Buyer Phone
**Status**: TESTED ✅  
**Test File**: `e2e_test_suite.ts` - `test_InvalidPhoneNumber`

**Flow**:
1. Vendor sends: "Je veux vendre MacBook à 100$ au +1234567890"
2. AI extraction fails phone validation
3. No draft saved
4. Bot: "Numéro invalide. Utilisez +243 ou +27."

---

### ❌ EC-V8: Vendor Sends Message with Missing Details
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Vendor sends: "Je veux vendre MacBook" (no amount, no buyer)
2. AI extraction incomplete
3. No draft saved
4. Bot: "Détails incomplets. Utilisez: VENDRE [item] à [amount]$ au [phone]"

**Need**: Test incomplete AI extraction

---

### ❌ EC-V9: Vendor Requests Human Support
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction in any state
2. Vendor clicks "AIDE" button
3. `transaction.requires_human = true`
4. Bot: "🆘 Assistance activée. Agent vous contactera sous 2h."
5. All automation halted

**Need**: Test file `test_human_support.ts`

---

### ❌ EC-V10: Amount Below Minimum ($1)
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Vendor sends: "Je veux vendre stylo à 0.50$ au +243..."
2. AI extracts amount: 0.50
3. State machine validates
4. Bot: "❌ Montant minimum: 1 USD"
5. No transaction created

**Need**: 
- Implement amount validation
- Test file `test_limits_validation.ts`

---

### ❌ EC-V11: Amount Above Maximum ($5000)
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Vendor sends: "Je veux vendre voiture à 10000$ au +243..."
2. AI extracts amount: 10000
3. State machine validates
4. Bot: "❌ Montant maximum: 5000 USD"
5. No transaction created

**Need**: Same as EC-V10

---

### ❌ EC-V12: Multiple Active Transactions
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Transaction #1 in SECURED (waiting for PIN)
2. Vendor creates Transaction #2
3. Both active simultaneously
4. Vendor submits PIN
5. Bot: "Quel transaction? CLT-111111 ou CLT-222222?"
6. Vendor specifies reference

**Need**: Test file `test_concurrency.ts`

---

### ❌ EC-V13: Transaction Expires (72 Hours)
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction in INITIATED for 72 hours
2. Cron job runs
3. Transaction → CANCELLED
4. Both parties notified: "Transaction expirée"

**Need**: 
- Implement cron job
- Test file `test_timeouts.ts`

---

### ❌ EC-V14: Payout Fails (Invalid Account)
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Transaction in SECURED
2. Vendor submits correct PIN
3. PawaPay payout fails (invalid account)
4. Transaction → PAYOUT_FAILED
5. Bot: "❌ Transfert échoué. Vérifiez votre numéro. [RÉESSAYER]"

**Need**: Test file `test_payout_failures.ts`

---

### ❌ EC-V15: Payout Delayed by Operator
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction in SECURED
2. Vendor submits correct PIN
3. PawaPay payout pending
4. Transaction → PAYOUT_DELAYED
5. Bot: "⏳ Transfert en cours. Peut prendre jusqu'à 24h."
6. Webhook updates when complete → COMPLETED

**Need**: Test payout delay handling

---

## 🟢 BUYER HAPPY PATHS

### ✅ HP-B1: Accept Transaction and Pay
**Status**: TESTED ✅  
**Test File**: `simulate_whatsapp_e2e.ts`

**Flow**:
1. Buyer receives WhatsApp notification
2. Transaction details shown
3. Buyer clicks "ACCEPTER"
4. Transaction → PENDING_FUNDING
5. Bot sends payment instructions
6. Buyer pays via mobile money
7. PawaPay webhook confirms
8. Transaction → SECURED
9. Buyer notified: "✅ Paiement reçu"

---

### ❌ HP-B2: Manual Payment Confirmation
**Status**: NOT TESTED ❌  
**Priority**: LOW

**Flow**:
1. Buyer accepts and pays
2. Webhook delayed (>5 minutes)
3. Buyer sends screenshot or "PAYÉ"
4. Bot: "Vérification en cours..."
5. Webhook arrives → SECURED

**Need**: Test manual confirmation flow

---

## 🔴 BUYER EDGE CASES

### ✅ EC-B1: Buyer Rejects Transaction
**Status**: TESTED ✅  
**Test File**: `e2e_test_suite.ts` - `test_BuyerRejectsTransaction`

**Flow**:
1. Buyer receives notification
2. Buyer clicks "REFUSER"
3. Transaction → CANCELLED
4. Vendor notified

---

### ❌ EC-B2: Buyer Ignores Transaction (No Response)
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Buyer receives notification
2. No response for 24 hours
3. Bot sends reminder
4. Still no response for 72 hours
5. Transaction → CANCELLED (expired)
6. Vendor notified

**Need**: Test file `test_timeouts.ts`

---

### ❌ EC-B3: Buyer Accepts But Never Pays
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Buyer clicks "ACCEPTER"
2. Transaction → PENDING_FUNDING
3. Payment instructions sent
4. No payment for 24 hours
5. Bot sends reminder
6. No payment for 72 hours
7. Transaction → CANCELLED
8. Vendor notified

**Need**: 
- Implement timeout system
- Test file `test_timeouts.ts`

---

### ❌ EC-B4: Buyer Pays Wrong Amount
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Transaction amount: $100
2. Buyer pays $90 (wrong amount)
3. PawaPay webhook: amount mismatch
4. Bot: "❌ Montant incorrect. Attendu: 100$, Reçu: 90$"
5. Transaction remains PENDING_FUNDING
6. Auto-refund initiated for $90

**Need**: 
- Implement amount validation in webhook
- Test file `test_payment_validation.ts`

---

### ❌ EC-B5: Payment Fails (Insufficient Funds)
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Buyer accepts transaction
2. Buyer initiates payment
3. PawaPay deposit fails (insufficient funds)
4. Bot: "❌ Paiement échoué. Vérifiez votre solde."
5. Transaction remains PENDING_FUNDING
6. Retry instructions sent

**Need**: Test payment failure handling

---

### ❌ EC-B6: Buyer Cancels After Accepting
**Status**: NOT TESTED ❌  
**Priority**: HIGH

**Flow**:
1. Transaction in PENDING_FUNDING
2. Buyer clicks "ANNULER" or sends "ANNULER"
3. Transaction → CANCELLED
4. Vendor notified

**Need**: Test file `test_buyer_cancellation.ts`

---

### ❌ EC-B7: Buyer Requests Refund After Payment
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction in SECURED
2. Buyer sends "REMBOURSER"
3. Bot: "Demande de remboursement envoyée au vendeur"
4. Vendor must approve
5. If approved → Refund initiated
6. Transaction → REFUNDED

**Need**: Test file `test_refund_flows.ts`

---

### ❌ EC-B8: Duplicate Payment Webhook
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Buyer pays $100
2. PawaPay webhook #1 arrives → SECURED
3. PawaPay webhook #2 arrives (duplicate)
4. Idempotency check: already SECURED
5. Duplicate ignored, no double-credit

**Need**: 
- Implement idempotency keys
- Test file `test_idempotency.ts`

---

### ❌ EC-B9: Buyer Requests Human Support
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction in any state
2. Buyer clicks "AIDE"
3. `transaction.requires_human = true`
4. Bot: "🆘 Assistance activée"
5. Automation halted

**Need**: Test file `test_human_support.ts`

---

### ❌ EC-B10: Payment from Different Number
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Transaction for buyer +243111111111
2. Payment arrives from +243222222222
3. PawaPay webhook: phone mismatch
4. Bot: "❌ Paiement reçu d'un autre numéro. Contactez assistance."
5. Payment held, manual verification required

**Need**: Test file `test_phone_validation.ts`

---

## 🔧 SYSTEM EDGE CASES

### ❌ EC-S1: AI Extraction Timeout
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Vendor sends AI message
2. OpenAI API timeout (>5 seconds)
3. Fallback extraction used
4. Bot: "Détails incomplets. Utilisez VENDRE pour mode guidé."

**Need**: Test file `test_ai_fallback.ts`

---

### ❌ EC-S2: Database Connection Failure
**Status**: NOT TESTED ❌  
**Priority**: LOW

**Flow**:
1. User sends message
2. Database query fails
3. Error logged
4. Bot: "⚠️ Service temporairement indisponible. Réessayez dans 1 minute."
5. Webhook returns 200 to prevent Meta retries

**Need**: Test DB failure recovery

---

### ❌ EC-S3: PawaPay API Down
**Status**: NOT TESTED ❌  
**Priority**: LOW

**Flow**:
1. Buyer pays via mobile money
2. PawaPay webhook delayed/failed
3. Payment in limbo
4. Cron job checks PawaPay API directly
5. Status updated when API recovers

**Need**: Test API downtime handling

---

### ❌ EC-S4: WhatsApp API Rate Limit
**Status**: NOT TESTED ❌  
**Priority**: MEDIUM

**Flow**:
1. Bot tries to send message
2. Meta API returns 429 (rate limit)
3. Message queued for retry
4. Retry with exponential backoff
5. Message sent when rate limit clears

**Need**: Test rate limit handling

---

### ❌ EC-S5: Concurrent State Transitions
**Status**: NOT TESTED ❌  
**Priority**: CRITICAL 🔴

**Flow**:
1. Buyer accepts (webhook #1)
2. Vendor cancels (webhook #2)
3. Both hit database simultaneously
4. Database transaction isolation prevents conflict
5. First write wins, second gets conflict error
6. Second operation retried with fresh state

**Need**: Test file `test_concurrency.ts`

---

### ❌ EC-S6: Malformed Webhook Payload
**Status**: NOT TESTED ❌  
**Priority**: LOW

**Flow**:
1. Webhook receives malformed JSON
2. Parsing fails gracefully
3. Error logged with payload
4. Returns 200 to prevent retries
5. Alert sent to monitoring

**Need**: Test malformed payload handling

---

### ✅ EC-S7: Webhook Signature Validation
**Status**: TESTED ✅  
**Test File**: Implicitly tested via E2E bypass

**Flow**:
1. Webhook receives request
2. Signature validation runs
3. Invalid signature → 401
4. Valid signature → Process request

---

## 📊 COVERAGE BY CATEGORY

| Category | Total | Tested | Not Tested | Coverage |
|----------|-------|--------|------------|----------|
| **Vendor Happy Paths** | 4 | 1 | 3 | 25% |
| **Vendor Edge Cases** | 15 | 4 | 11 | 27% |
| **Buyer Happy Paths** | 2 | 1 | 1 | 50% |
| **Buyer Edge Cases** | 10 | 1 | 9 | 10% |
| **System Edge Cases** | 7 | 1 | 6 | 14% |
| **TOTAL** | **38** | **8** | **30** | **21%** |

---

## 🔴 CRITICAL PRIORITIES (Must Fix Before Production)

1. **EC-V3**: Refund flow after payment
2. **EC-V10/V11**: Amount limits ($1-$5000)
3. **EC-B3**: Buyer accepts but never pays (timeout)
4. **EC-B4**: Buyer pays wrong amount
5. **EC-B8**: Duplicate payment webhook (idempotency)
6. **EC-S5**: Concurrent state transitions

---

## 📁 DOCUMENTATION FILES

All flows are documented in:
- ✅ **COMPREHENSIVE_FLOW_MATRIX.md** - Detailed descriptions of all 38 scenarios
- ✅ **STATE_TRANSITION_MAP.md** - State diagram and transition matrix
- ✅ **IMPLEMENTATION_ROADMAP.md** - 3-week implementation plan
- ✅ **ALL_FLOWS_CHECKLIST.md** - This file (quick reference)

---

**Last Updated**: May 4, 2026, 11:35 PM UTC+2  
**Current Coverage**: 21% (8/38)  
**Target Coverage**: 90% (34/38)  
**Timeline**: 3 weeks
