# 🎯 COMPREHENSIVE UAT TEST PLAN
## All 38 Scenarios - WhatsApp Bot Testing

**Test Environment**: Production  
**Vendor Number**: +27603960790  
**Buyer Number**: +27695446706  
**Mode**: Sandbox/Demo (PawaPay)  
**Date**: May 5, 2026

---

## 📋 HOW TO USE THIS UAT PLAN

### Test Execution Process

1. **Read the scenario** description
2. **Send the exact message** shown in "Message to Send"
3. **Verify the response** matches "Expected Response"
4. **Check the result** in "Success Criteria"
5. **Mark status** in the Status column (✅ or ❌)
6. **Record actual response** in Notes if different

### Status Codes

- ✅ **PASS** - Works as expected
- ❌ **FAIL** - Does not work as expected
- ⏸️ **SKIP** - Skipped (dependency not met)
- 🔄 **RETRY** - Needs retry

---

## 🧪 TEST SCENARIOS (38 Total)

### VENDOR HAPPY PATHS (4 scenarios)

#### HP-V1: AI-Powered Transaction Creation

| Field | Value |
|-------|-------|
| **Scenario** | Vendor creates transaction using natural language |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre MacBook Air M1 à 50$ au +27695446706` |
| **Expected Response** | AI extracts details and shows confirmation prompt with:<br>- Item: MacBook Air M1<br>- Amount: 50 USD<br>- Buyer: +27695446706<br>- Buttons: "Oui" / "Non" |
| **Success Criteria** | - AI draft created in database<br>- Confirmation message sent<br>- All details correct |
| **Status** | ✅ |
| **Notes** | |

---

#### HP-V2: Guided Transaction (VENDRE)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor uses VENDRE command for guided flow |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `VENDRE` |
| **Expected Response** | Bot asks: "Que voulez-vous vendre?" |
| **Success Criteria** | - Guided flow initiated<br>- Bot prompts for item description |
| **Status** | ✅ |
| **Notes** | |

---

#### HP-V3: Payout Retry After Failure

| Field | Value |
|-------|-------|
| **Scenario** | Vendor retries failed payout |
| **Prerequisites** | Transaction in PAYOUT_FAILED state |
| **User** | Vendor (+27603960790) |
| **Message to Send** | Click "Réessayer" button |
| **Expected Response** | "Nouvelle tentative de paiement en cours..." |
| **Success Criteria** | - Payout retry initiated<br>- Status updated |
| **Status** | ⬜ |
| **Notes** | |

---

#### HP-V4: Relaunch Transaction (RELANCER)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor relaunches previous transaction |
| **Prerequisites** | At least one completed transaction |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `RELANCER CLT-XXXXXXXX` (use actual transaction ref) |
| **Expected Response** | Shows previous transaction details and asks to confirm relaunch |
| **Success Criteria** | - Previous transaction found<br>- Relaunch prompt shown |
| **Status** | ⬜ |
| **Notes** | |

---

### VENDOR EDGE CASES (15 scenarios)

#### EC-V1: Cancel Before Buyer Accepts

| Field | Value |
|-------|-------|
| **Scenario** | Vendor cancels transaction in INITIATED state |
| **Prerequisites** | Transaction in INITIATED state |
| **User** | Vendor (+27603960790) |
| **Message to Send** | Click "Annuler" button |
| **Expected Response** | "❌ Transaction annulée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V2: Cancel in PENDING_FUNDING

| Field | Value |
|-------|-------|
| **Scenario** | Vendor cancels after buyer accepted but before payment |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | Vendor (+27603960790) |
| **Message to Send** | Click "Annuler" button |
| **Expected Response** | "❌ Transaction annulée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-V3: Refund After Payment (SECURED → REFUNDED)

| Field | Value |
|-------|-------|
| **Scenario** | System refunds buyer after TTL expiry |
| **Prerequisites** | Transaction in SECURED state for 72+ hours |
| **User** | System (automatic) |
| **Message to Send** | N/A (cron job) |
| **Expected Response** | Both parties receive refund notification |
| **Success Criteria** | - Status = REFUNDED<br>- PawaPay refund initiated<br>- Notifications sent |
| **Status** | ⬜ |
| **Notes** | Requires waiting 72 hours or manual cron trigger |

---

#### EC-V4: Wrong PIN Recovery (1 wrong, then correct)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor enters wrong PIN once, then correct PIN |
| **Prerequisites** | Transaction in SECURED state with PIN |
| **User** | Vendor (+27603960790) |
| **Message to Send** | 1. `9999` (wrong)<br>2. `1234` (correct, use actual PIN) |
| **Expected Response** | 1. "❌ Code PIN incorrect. Il vous reste 2 tentatives."<br>2. "✅ Code PIN validé. Paiement en cours..." |
| **Success Criteria** | - First attempt increments pin_attempts<br>- Second attempt validates and initiates payout |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V5: PIN Lockout (3 Wrong Attempts)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor enters wrong PIN 3 times |
| **Prerequisites** | Transaction in SECURED state with PIN |
| **User** | Vendor (+27603960790) |
| **Message to Send** | 1. `9999`<br>2. `8888`<br>3. `7777` |
| **Expected Response** | After 3rd attempt: "🔒 Transaction verrouillée. Trop de tentatives incorrectes. Contactez l'assistance." |
| **Success Criteria** | - Status = PIN_FAILED_LOCKED<br>- Refund initiated<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-V6: Reject AI Prefill

| Field | Value |
|-------|-------|
| **Scenario** | Vendor rejects AI-extracted transaction details |
| **Prerequisites** | AI draft created |
| **User** | Vendor (+27603960790) |
| **Message to Send** | Click "Non" button on AI confirmation |
| **Expected Response** | "Transaction annulée. Vous pouvez créer une nouvelle transaction." |
| **Success Criteria** | - AI draft deleted<br>- No transaction created |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V7: Invalid Buyer Phone

| Field | Value |
|-------|-------|
| **Scenario** | Vendor provides invalid phone number |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre MacBook à 50$ au +1234567890` |
| **Expected Response** | "❌ Numéro de téléphone invalide. Veuillez utiliser un numéro valide." |
| **Success Criteria** | - No transaction created<br>- Error message shown |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V8: Missing AI Details

| Field | Value |
|-------|-------|
| **Scenario** | Vendor message missing amount or buyer |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre MacBook` |
| **Expected Response** | Bot asks for missing details: "Quel est le montant?" or "À qui voulez-vous vendre?" |
| **Success Criteria** | - AI handles gracefully<br>- Prompts for missing info |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-V9: Human Support Request

| Field | Value |
|-------|-------|
| **Scenario** | Vendor requests human assistance |
| **Prerequisites** | Active transaction |
| **User** | Vendor (+27603960790) |
| **Message to Send** | Click "Aide" button |
| **Expected Response** | "🆘 Demande d'assistance enregistrée. Un agent vous contactera bientôt." |
| **Success Criteria** | - requires_human = true<br>- Admin notified |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V10: Amount Below Minimum ($0.50)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor tries to create transaction below $1 minimum |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre stylo à 0.50$ au +27695446706` |
| **Expected Response** | "❌ Montant minimum: 1.00 USD" |
| **Success Criteria** | - Transaction rejected<br>- Error message shown |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V11: Amount Above Maximum ($3000)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor tries to create transaction above $2,500 maximum |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre voiture à 3000$ au +27695446706` |
| **Expected Response** | "❌ Montant maximum: 2,500.00 USD" |
| **Success Criteria** | - Transaction rejected<br>- Error message shown |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-V12: Multiple Active Transactions (Concurrent)

| Field | Value |
|-------|-------|
| **Scenario** | Vendor has 2+ SECURED transactions and submits PIN |
| **Prerequisites** | 2+ transactions in SECURED state |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `1234` (PIN) |
| **Expected Response** | "🔢 Vous avez plusieurs transactions actives. Laquelle concerne ce code PIN?<br><br>1. CLT-XXXXXXXX: Item 1 (100$)<br>2. CLT-YYYYYYYY: Item 2 (200$)<br><br>Répondez avec le numéro (1, 2, etc.) ou CLT-XXXXXXXX" |
| **Success Criteria** | - Disambiguation prompt shown<br>- Lists all SECURED transactions |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-V13: Transaction Expiry (72h)

| Field | Value |
|-------|-------|
| **Scenario** | SECURED transaction expires after 72 hours |
| **Prerequisites** | Transaction in SECURED state for 72+ hours |
| **User** | System (automatic) |
| **Message to Send** | N/A (cron job) |
| **Expected Response** | "⏰ Délai expiré. Vos fonds ont été remboursés (hors frais opérateur)." |
| **Success Criteria** | - Status = REFUNDED<br>- Refund initiated<br>- Vendor penalized |
| **Status** | ⬜ |
| **Notes** | Requires waiting 72 hours or manual cron trigger |

---

#### EC-V14: Payout Fails

| Field | Value |
|-------|-------|
| **Scenario** | PawaPay payout fails permanently |
| **Prerequisites** | Transaction ready for payout |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook) |
| **Expected Response** | "❌ Le paiement a échoué. Un remboursement va être effectué." |
| **Success Criteria** | - Status = PAYOUT_FAILED<br>- Refund initiated |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay sandbox failure simulation |

---

#### EC-V15: Payout Delayed

| Field | Value |
|-------|-------|
| **Scenario** | PawaPay payout is delayed |
| **Prerequisites** | Transaction ready for payout |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook) |
| **Expected Response** | "⏳ Paiement en cours. Cela peut prendre quelques minutes." |
| **Success Criteria** | - Status = PAYOUT_DELAYED<br>- Retry mechanism active |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay sandbox delay simulation |

---

### BUYER HAPPY PATHS (2 scenarios)

#### HP-B1: Accept and Pay

| Field | Value |
|-------|-------|
| **Scenario** | Buyer accepts transaction and pays |
| **Prerequisites** | Transaction in INITIATED state |
| **User** | Buyer (+27695446706) |
| **Message to Send** | Click "Accepter" button |
| **Expected Response** | "✅ Transaction acceptée. Veuillez effectuer le paiement Mobile Money de 50.00 USD." |
| **Success Criteria** | - Status = PENDING_FUNDING<br>- Payment instructions sent |
| **Status** | ⬜ |
| **Notes** | |

---

#### HP-B2: Manual Payment Confirmation

| Field | Value |
|-------|-------|
| **Scenario** | Payment webhook confirms buyer payment |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook) |
| **Expected Response** | "🔐 Paiement sécurisé. Voici votre code PIN de livraison: 1234" |
| **Success Criteria** | - Status = SECURED<br>- PIN generated<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay sandbox webhook simulation |

---

### BUYER EDGE CASES (10 scenarios)

#### EC-B1: Buyer Rejects Transaction

| Field | Value |
|-------|-------|
| **Scenario** | Buyer rejects transaction offer |
| **Prerequisites** | Transaction in INITIATED state |
| **User** | Buyer (+27695446706) |
| **Message to Send** | Click "Refuser" button |
| **Expected Response** | "❌ Transaction refusée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-B2: Buyer Ignores Transaction (Timeout)

| Field | Value |
|-------|-------|
| **Scenario** | Buyer doesn't respond within 24 hours |
| **Prerequisites** | Transaction in INITIATED state for 24+ hours |
| **User** | System (automatic) |
| **Message to Send** | N/A (cron job) |
| **Expected Response** | "⏰ Transaction expirée. L'acheteur n'a pas répondu." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | Requires waiting 24 hours or manual cron trigger |

---

#### EC-B3: Buyer Accepts But Never Pays

| Field | Value |
|-------|-------|
| **Scenario** | Buyer accepts but doesn't pay within 30 minutes |
| **Prerequisites** | Transaction in PENDING_FUNDING for 30+ minutes |
| **User** | System (automatic) |
| **Message to Send** | N/A (cron job) |
| **Expected Response** | "❌ Le paiement Mobile Money a échoué ou a expiré. La transaction a été annulée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | Requires waiting 30 minutes or manual cron trigger |

---

#### EC-B4: Buyer Pays Wrong Amount

| Field | Value |
|-------|-------|
| **Scenario** | Buyer pays different amount than expected |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook with wrong amount) |
| **Expected Response** | "❌ Montant incorrect reçu. Transaction annulée. Remboursement en cours." |
| **Success Criteria** | - Transaction cancelled<br>- Refund initiated |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay webhook with amount data |

---

#### EC-B5: Payment Fails (Insufficient Funds)

| Field | Value |
|-------|-------|
| **Scenario** | Buyer's payment fails due to insufficient funds |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook with FAILED status) |
| **Expected Response** | "❌ Le paiement Mobile Money a échoué ou a expiré. La transaction a été annulée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay sandbox failure simulation |

---

#### EC-B6: Buyer Cancels After Accepting

| Field | Value |
|-------|-------|
| **Scenario** | Buyer cancels after accepting but before paying |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | Buyer (+27695446706) |
| **Message to Send** | Click "Annuler" button |
| **Expected Response** | "❌ Transaction annulée." |
| **Success Criteria** | - Status = CANCELLED<br>- Both parties notified |
| **Status** | ⬜ |
| **Notes** | |

---

#### EC-B7: Buyer Requests Refund

| Field | Value |
|-------|-------|
| **Scenario** | Buyer requests refund for SECURED transaction |
| **Prerequisites** | Transaction in SECURED state |
| **User** | Buyer (+27695446706) |
| **Message to Send** | Click "Demander Remboursement" button |
| **Expected Response** | "🆘 Demande de remboursement enregistrée. Un agent examinera votre demande." |
| **Success Criteria** | - Refund request logged<br>- Admin notified |
| **Status** | ⬜ |
| **Notes** | Feature may not be fully implemented |

---

#### EC-B8: Duplicate Payment Webhook

| Field | Value |
|-------|-------|
| **Scenario** | PawaPay sends duplicate payment confirmation |
| **Prerequisites** | Transaction already SECURED |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (duplicate webhook) |
| **Expected Response** | No duplicate processing (silent) |
| **Success Criteria** | - Idempotency check passes<br>- No double-crediting<br>- Logged as duplicate |
| **Status** | ⬜ |
| **Notes** | Check processed_webhooks table |

---

#### EC-B9: Buyer Requests Human Support

| Field | Value |
|-------|-------|
| **Scenario** | Buyer requests human assistance |
| **Prerequisites** | Active transaction |
| **User** | Buyer (+27695446706) |
| **Message to Send** | Click "Aide" button |
| **Expected Response** | "🆘 Demande d'assistance enregistrée. Un agent vous contactera bientôt." |
| **Success Criteria** | - requires_human = true<br>- Admin notified |
| **Status** | ✅ |
| **Notes** | |

---

#### EC-B10: Payment from Different Number

| Field | Value |
|-------|-------|
| **Scenario** | Payment comes from different phone than buyer's |
| **Prerequisites** | Transaction in PENDING_FUNDING state |
| **User** | System (PawaPay webhook) |
| **Message to Send** | N/A (webhook with different payer phone) |
| **Expected Response** | "⚠️ Paiement reçu d'un numéro différent. Vérification en cours." |
| **Success Criteria** | - Payment flagged<br>- Admin notified |
| **Status** | ⬜ |
| **Notes** | Requires PawaPay webhook with payer phone data |

---

### SYSTEM EDGE CASES (7 scenarios)

#### EC-S1: AI Extraction Timeout

| Field | Value |
|-------|-------|
| **Scenario** | OpenAI API times out during extraction |
| **Prerequisites** | None |
| **User** | Vendor (+27603960790) |
| **Message to Send** | `Je veux vendre MacBook` |
| **Expected Response** | Falls back to guided flow or error message |
| **Success Criteria** | - System handles gracefully<br>- No crash<br>- User gets response |
| **Status** | ⬜ |
| **Notes** | Difficult to test without simulating timeout |

---

#### EC-S2: Database Connection Failure

| Field | Value |
|-------|-------|
| **Scenario** | Database becomes unavailable |
| **Prerequisites** | None |
| **User** | Any user |
| **Message to Send** | Any message |
| **Expected Response** | "⚠️ Service temporairement indisponible. Veuillez réessayer." |
| **Success Criteria** | - Error logged<br>- User notified<br>- No crash |
| **Status** | ⬜ |
| **Notes** | Difficult to test without simulating DB failure |

---

#### EC-S3: PawaPay API Down

| Field | Value |
|-------|-------|
| **Scenario** | PawaPay API is unavailable |
| **Prerequisites** | Transaction ready for payment/payout |
| **User** | System |
| **Message to Send** | N/A |
| **Expected Response** | Retry mechanism activates |
| **Success Criteria** | - Error logged<br>- Retry scheduled<br>- User notified of delay |
| **Status** | ⬜ |
| **Notes** | Difficult to test without simulating API downtime |

---

#### EC-S4: WhatsApp API Rate Limit

| Field | Value |
|-------|-------|
| **Scenario** | WhatsApp API rate limit reached |
| **Prerequisites** | High message volume |
| **User** | System |
| **Message to Send** | N/A |
| **Expected Response** | Messages queued and sent when limit resets |
| **Success Criteria** | - Messages queued<br>- No messages lost<br>- Error logged |
| **Status** | ⬜ |
| **Notes** | Difficult to test without high volume |

---

#### EC-S5: Concurrent State Transitions

| Field | Value |
|-------|-------|
| **Scenario** | Two users try to change transaction state simultaneously |
| **Prerequisites** | Transaction in INITIATED state |
| **User** | Vendor + Buyer (simultaneously) |
| **Message to Send** | Vendor clicks "Annuler", Buyer clicks "Accepter" at same time |
| **Expected Response** | One action succeeds, other gets error |
| **Success Criteria** | - Only one state change succeeds<br>- No race condition<br>- Consistent state |
| **Status** | ⬜ |
| **Notes** | Requires precise timing |

---

#### EC-S6: Malformed Webhook Payload

| Field | Value |
|-------|-------|
| **Scenario** | Webhook receives invalid/malformed data |
| **Prerequisites** | None |
| **User** | System (webhook) |
| **Message to Send** | N/A (malformed webhook) |
| **Expected Response** | Returns 200 to prevent retries, logs error |
| **Success Criteria** | - Returns 200<br>- Error logged<br>- No crash |
| **Status** | ⬜ |
| **Notes** | Requires manual webhook simulation |

---

#### EC-S7: Webhook Signature Validation

| Field | Value |
|-------|-------|
| **Scenario** | Webhook with invalid signature is rejected |
| **Prerequisites** | E2E bypass disabled |
| **User** | System (webhook) |
| **Message to Send** | N/A (webhook with invalid signature) |
| **Expected Response** | Returns 401 Unauthorized |
| **Success Criteria** | - Invalid signature rejected<br>- No processing<br>- Error logged |
| **Status** | ⬜ |
| **Notes** | Set ALLOW_E2E_TEST_BYPASS=false to test |

---

## 📊 UAT SUMMARY TEMPLATE

### Test Execution Summary

| Category | Total | Passed | Failed | Skipped | Pass Rate |
|----------|-------|--------|--------|---------|-----------|
| Vendor Happy Paths | 4 | | | | % |
| Vendor Edge Cases | 15 | | | | % |
| Buyer Happy Paths | 2 | | | | % |
| Buyer Edge Cases | 10 | | | | % |
| System Edge Cases | 7 | | | | % |
| **TOTAL** | **38** | | | | **%** |

### Critical Issues Found

| Issue # | Scenario | Description | Severity | Status |
|---------|----------|-------------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### Recommendations

1. 
2. 
3. 

---

## 🔧 TROUBLESHOOTING GUIDE

### Common Issues

**Issue**: Bot doesn't respond  
**Solution**: Check WhatsApp webhook is deployed and accessible

**Issue**: AI extraction fails  
**Solution**: Check OpenAI API key is set and valid

**Issue**: Payment webhook not received  
**Solution**: Check PawaPay webhook URL is configured correctly

**Issue**: Transaction stuck in state  
**Solution**: Check cron jobs are running

---

## 📝 REPORTING TEMPLATE

### For Each Failed Test

```
Scenario: [Scenario Name]
Expected: [What should happen]
Actual: [What actually happened]
Steps to Reproduce:
1. 
2. 
3. 

Screenshots: [Attach WhatsApp screenshots]
Database State: [Transaction status, relevant fields]
Error Logs: [From Supabase logs]
```

---

**Test Completed By**: _______________  
**Date**: _______________  
**Overall Result**: ⬜ PASS / ⬜ FAIL  
**Production Ready**: ⬜ YES / ⬜ NO

