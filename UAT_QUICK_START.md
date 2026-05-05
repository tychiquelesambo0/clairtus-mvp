§§# ⚡ UAT QUICK START GUIDE
## Get Testing in 5 Minutes

**Goal**: Test all 38 scenarios with your South African WhatsApp numbers  
**Time**: 2-4 hours for complete UAT  
**Numbers**: +27603960790 (Vendor), +27695446706 (Buyer)

---

## 🚀 5-MINUTE SETUP

### Step 1: Open Required Tools (2 minutes)

1. **WhatsApp on Both Phones**
   - Vendor phone: +27603960790
   - Buyer phone: +27695446706

2. **Open Files in Editor**
   - `UAT_TEST_PLAN.md` - Your test script
   - `UAT_REPORTING_SYSTEM.md` - Your logging sheet

3. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq
   - Open "Table Editor" tab
   - Open "SQL Editor" tab (for queries)

4. **Optional: Screen Recording**
   - Start recording for evidence

### Step 2: Understand the Process (2 minutes)

**For Each Test**:
1. Read scenario in `UAT_TEST_PLAN.md`
2. Send exact message shown
3. Check bot response
4. Verify database state
5. Mark ✅ or ❌ in Status column
6. Log result in `UAT_REPORTING_SYSTEM.md`

### Step 3: Start Testing (1 minute)

1. Go to `UAT_TEST_PLAN.md`
2. Start with **HP-V1: AI-Powered Transaction Creation**
3. Follow the template

---

## 📱 FIRST TEST WALKTHROUGH

### HP-V1: AI-Powered Transaction Creation

**1. Read the Scenario**
```
Vendor creates transaction using natural language
```

**2. Send Message** (from +27603960790)
```
Je veux vendre MacBook Air M1 à 50$ au +27695446706
```

**3. Expected Response**
```
✅ Voici le résumé de votre transaction:

📦 Article: MacBook Air M1
💰 Montant: 50.00 USD
👤 Acheteur: +27695446706

Est-ce correct?
[Oui] [Non]
```

**4. Verify Database** (Supabase > Table Editor > ai_transaction_drafts)
```sql
SELECT * FROM ai_transaction_drafts 
WHERE sender_phone = '+27603960790' 
ORDER BY created_at DESC LIMIT 1;
```

Should show:
- intent: "VENDRE"
- amount: 50
- item_description: "MacBook Air M1"
- counterparty_phone: "+27695446706"

**5. Mark Status**

In `UAT_TEST_PLAN.md`, find HP-V1 and mark:
- Status: ✅ (if passed) or ❌ (if failed)

**6. Log Result**

In `UAT_REPORTING_SYSTEM.md`, under "PASSED TESTS":
```
✅ HP-V1 - AI-Powered Transaction Creation
Time: 14:30
Message Sent: "Je veux vendre MacBook Air M1 à 50$ au +27695446706"
Response Received: "[paste actual response]"
Database State: AI draft created, amount=50, item=MacBook Air M1
Notes: All fields extracted correctly
---
```

---

## 🎯 TESTING STRATEGY

### Recommended Order

**Phase 1: Core Happy Paths** (30 minutes)
1. HP-V1: AI Transaction Creation
2. HP-B1: Buyer Accept
3. HP-B2: Payment Confirmation
4. Complete one full transaction end-to-end

**Phase 2: Vendor Flows** (60 minutes)
5. HP-V2: Guided Flow (VENDRE)
6. EC-V1: Cancel Before Buyer Accepts
7. EC-V2: Cancel in PENDING_FUNDING
8. EC-V5: PIN Lockout
9. EC-V6: Reject AI Prefill
10. EC-V9: Human Support
11. EC-V12: Multiple Transactions

**Phase 3: Buyer Flows** (45 minutes)
12. EC-B1: Buyer Rejects
13. EC-B6: Buyer Cancels After Accepting
14. EC-B9: Buyer Human Support

**Phase 4: Edge Cases** (45 minutes)
15. EC-V7: Invalid Phone
16. EC-V10: Amount Below Minimum
17. EC-V11: Amount Above Maximum
18. EC-S6: Malformed Payload

**Phase 5: System Tests** (30 minutes)
19. EC-B8: Duplicate Webhook
20. EC-S7: Signature Validation
21. Remaining scenarios

---

## 🔍 QUICK VERIFICATION CHECKLIST

### For Each Test

- [ ] Message sent from correct phone
- [ ] Bot responded (or didn't, if expected)
- [ ] Response matches expected text
- [ ] Database state is correct
- [ ] No errors in Supabase logs
- [ ] Status marked in UAT_TEST_PLAN.md
- [ ] Result logged in UAT_REPORTING_SYSTEM.md

### Database Checks

**Quick Status Check**:
```sql
SELECT id, status, seller_phone, buyer_phone, item_description, base_amount
FROM transactions
WHERE seller_phone = '+27603960790' OR buyer_phone = '+27695446706'
ORDER BY created_at DESC LIMIT 5;
```

**Check for Errors**:
```sql
SELECT * FROM error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## 🐛 WHEN TESTS FAIL

### Immediate Actions

1. **Don't Panic** - Failures are expected in UAT
2. **Take Screenshot** - Capture WhatsApp conversation
3. **Check Database** - Run verification queries
4. **Check Logs** - Supabase > Logs > Edge Functions
5. **Document Everything** - Use failure template in UAT_REPORTING_SYSTEM.md

### Failure Template (Quick)

```
❌ [Scenario ID]
Expected: [brief]
Actual: [brief]
Screenshot: [filename]
Transaction ID: [UUID]
Time: [HH:MM]
```

### Common Issues & Fixes

**Issue**: Bot doesn't respond  
**Check**: 
- Supabase > Functions > whatsapp-webhook > Logs
- Is function deployed?
- Are environment variables set?

**Issue**: Wrong response  
**Check**:
- Database transaction status
- AI draft content
- Error logs

**Issue**: Database state wrong  
**Check**:
- Transaction status log
- Recent status changes
- Webhook processing logs

---

## 📊 PROGRESS TRACKING

### Quick Progress Check

After every 5 tests, update this:

| Tests Completed | Passed | Failed | Pass Rate |
|-----------------|--------|--------|-----------|
| 5 | ___ | ___ | ___% |
| 10 | ___ | ___ | ___% |
| 15 | ___ | ___ | ___% |
| 20 | ___ | ___ | ___% |
| 25 | ___ | ___ | ___% |
| 30 | ___ | ___ | ___% |
| 35 | ___ | ___ | ___% |
| 38 | ___ | ___ | ___% |

**Target**: ≥ 95% pass rate (max 2 failures)

---

## ⏱️ TIME ESTIMATES

| Phase | Scenarios | Est. Time |
|-------|-----------|-----------|
| Setup | - | 5 min |
| Core Happy Paths | 4 | 30 min |
| Vendor Flows | 11 | 60 min |
| Buyer Flows | 8 | 45 min |
| Edge Cases | 8 | 45 min |
| System Tests | 7 | 30 min |
| **Total** | **38** | **3h 35min** |

Add 25% buffer for issues: **~4.5 hours total**

---

## 🎯 SUCCESS CRITERIA

### Minimum for Production

- [ ] All 38 scenarios executed
- [ ] ≥ 36 scenarios passed (95%)
- [ ] 0 critical bugs (P0)
- [ ] ≤ 2 high priority bugs (P1)
- [ ] Core flows (HP-V1, HP-B1, HP-B2) all pass
- [ ] Idempotency (EC-B8) passes
- [ ] Concurrent handling (EC-V12) passes

### Ideal for Production

- [ ] 38/38 scenarios passed (100%)
- [ ] 0 bugs of any severity
- [ ] All database states correct
- [ ] All error handling graceful
- [ ] All notifications sent correctly

---

## 📞 NEED HELP?

### Quick Troubleshooting

1. **Check Supabase Logs** first
2. **Verify environment variables** are set
3. **Check function deployment** status
4. **Review database migrations** are applied
5. **Test with simple message** first

### Resources

- **UAT Test Plan**: `UAT_TEST_PLAN.md`
- **Reporting System**: `UAT_REPORTING_SYSTEM.md`
- **Implementation Report**: `FINAL_IMPLEMENTATION_REPORT.md`
- **Quick Start**: `QUICK_START.md`

---

## ✅ FINAL CHECKLIST

Before starting UAT:
- [ ] Both phones ready with WhatsApp
- [ ] UAT_TEST_PLAN.md open
- [ ] UAT_REPORTING_SYSTEM.md open
- [ ] Supabase Dashboard open
- [ ] Screen recording started (optional)
- [ ] Coffee/water ready ☕

During UAT:
- [ ] Following test order
- [ ] Marking each status
- [ ] Logging all results
- [ ] Taking screenshots of failures
- [ ] Checking database after each test

After UAT:
- [ ] All 38 scenarios marked
- [ ] Summary table filled
- [ ] All failures documented
- [ ] Screenshots saved
- [ ] Final report completed
- [ ] Go/No-Go decision made

---

**Ready to Start?**

1. Open `UAT_TEST_PLAN.md`
2. Go to **HP-V1: AI-Powered Transaction Creation**
3. Send the message
4. Let's test! 🚀

**Good luck!** 🍀

