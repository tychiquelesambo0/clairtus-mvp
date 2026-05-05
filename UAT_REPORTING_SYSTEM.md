# 📊 UAT REPORTING SYSTEM
## Track, Report, and Validate All Test Scenarios

**Purpose**: Systematic tracking of UAT test execution with real-time reporting  
**Users**: QA Team, Product Owner, Developers  
**Test Numbers**: +27603960790 (Vendor), +27695446706 (Buyer)

---

## 🎯 REPORTING WORKFLOW

### Step 1: Pre-Test Setup

1. **Open UAT_TEST_PLAN.md** in your editor
2. **Open this file** (UAT_REPORTING_SYSTEM.md) for logging
3. **Open WhatsApp** on both test phones
4. **Open Supabase Dashboard** for database verification
5. **Start screen recording** (optional but recommended)

### Step 2: Execute Each Test

For each scenario in UAT_TEST_PLAN.md:

1. **Read scenario** carefully
2. **Send message** as specified
3. **Observe response** from bot
4. **Verify database** state
5. **Mark status** in UAT_TEST_PLAN.md
6. **Log result** in this file (see templates below)

### Step 3: Report Results

After completing all tests:

1. **Fill summary table** below
2. **Document all failures** in detail
3. **Take screenshots** of failures
4. **Export database** state for failed scenarios
5. **Create issue tickets** for bugs

---

## 📋 REAL-TIME TEST LOG

### Test Session Information

| Field | Value |
|-------|-------|
| **Test Date** | _________________ |
| **Tester Name** | _________________ |
| **Environment** | Production / Staging |
| **Bot Version** | _________________ |
| **Start Time** | _________________ |
| **End Time** | _________________ |

---

## ✅ PASSED TESTS

### Template
```
✅ [Scenario ID] - [Scenario Name]
Time: [HH:MM]
Message Sent: "[exact message]"
Response Received: "[bot response]"
Database State: [status, key fields]
Notes: [any observations]
---
```

### Log Passed Tests Here

```
[Start logging passed tests below]




```

---

## ❌ FAILED TESTS

### Template
```
❌ [Scenario ID] - [Scenario Name]
Time: [HH:MM]
Severity: Critical / High / Medium / Low

EXPECTED:
- [What should happen]

ACTUAL:
- [What actually happened]

STEPS TO REPRODUCE:
1. [Step 1]
2. [Step 2]
3. [Step 3]

MESSAGE SENT:
"[exact message sent]"

BOT RESPONSE:
"[actual bot response or no response]"

DATABASE STATE:
- Transaction ID: [UUID]
- Status: [current status]
- Expected Status: [what it should be]
- Other Fields: [relevant fields]

ERROR LOGS:
[Paste from Supabase > Logs]

SCREENSHOTS:
[Attach or reference screenshot files]

ROOT CAUSE:
[Your analysis of why it failed]

RECOMMENDED FIX:
[Suggested solution]

---
```

### Log Failed Tests Here

```
[Start logging failed tests below]




```

---

## ⏸️ SKIPPED TESTS

### Template
```
⏸️ [Scenario ID] - [Scenario Name]
Reason: [Why skipped]
Dependency: [What's needed to run this test]
---
```

### Log Skipped Tests Here

```
[Start logging skipped tests below]




```

---

## 🔄 TESTS REQUIRING RETRY

### Template
```
🔄 [Scenario ID] - [Scenario Name]
Retry Reason: [Why retry needed]
Previous Attempts: [Number of attempts]
Next Action: [What to try next]
---
```

### Log Retry Tests Here

```
[Start logging retry tests below]




```

---

## 📊 LIVE SUMMARY DASHBOARD

### Overall Progress

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Tests** | 38 | 100% |
| **Completed** | ___ | ___% |
| **Passed** | ___ | ___% |
| **Failed** | ___ | ___% |
| **Skipped** | ___ | ___% |
| **Pending** | ___ | ___% |

### By Category

| Category | Total | Passed | Failed | Skipped | Pass Rate |
|----------|-------|--------|--------|---------|-----------|
| Vendor Happy Paths | 4 | ___ | ___ | ___ | ___% |
| Vendor Edge Cases | 15 | ___ | ___ | ___ | ___% |
| Buyer Happy Paths | 2 | ___ | ___ | ___ | ___% |
| Buyer Edge Cases | 10 | ___ | ___ | ___ | ___% |
| System Edge Cases | 7 | ___ | ___ | ___ | ___% |

### Critical Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Pass Rate** | ≥ 95% | ___% | ⬜ |
| **Critical Bugs** | 0 | ___ | ⬜ |
| **High Priority Bugs** | ≤ 2 | ___ | ⬜ |
| **Test Coverage** | 100% | ___% | ⬜ |

---

## 🐛 BUG TRACKING

### Bug Template
```
BUG #[Number]
Title: [Short description]
Scenario: [Scenario ID and name]
Severity: Critical / High / Medium / Low
Priority: P0 / P1 / P2 / P3
Status: Open / In Progress / Fixed / Closed

Description:
[Detailed description of the bug]

Impact:
[How this affects users/system]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Result:
[What should happen]

Actual Result:
[What actually happens]

Evidence:
- Screenshots: [file names]
- Database: [transaction ID, state]
- Logs: [error messages]

Assigned To: [Developer name]
Target Fix Date: [Date]
Actual Fix Date: [Date]
Verification: ⬜ Passed / ⬜ Failed
```

### Active Bugs

```
[Log bugs here]




```

---

## 📸 SCREENSHOT REFERENCE

### Naming Convention
```
[ScenarioID]_[Status]_[Timestamp].png

Examples:
HP-V1_PASS_20260505_1430.png
EC-V5_FAIL_20260505_1445.png
EC-B8_RETRY_20260505_1500.png
```

### Screenshot Checklist

For each failed test, capture:
- [ ] WhatsApp conversation showing message sent
- [ ] Bot response (or lack thereof)
- [ ] Supabase transaction table showing status
- [ ] Supabase error logs (if any)
- [ ] Network tab showing webhook calls (if relevant)

---

## 🗄️ DATABASE VERIFICATION

### Query Templates

**Check Transaction Status**
```sql
SELECT 
  id,
  status,
  seller_phone,
  buyer_phone,
  item_description,
  base_amount,
  created_at,
  updated_at,
  expires_at
FROM transactions
WHERE seller_phone = '+27603960790' 
   OR buyer_phone = '+27695446706'
ORDER BY created_at DESC
LIMIT 10;
```

**Check AI Drafts**
```sql
SELECT 
  sender_phone,
  intent,
  amount,
  counterparty_phone,
  item_description,
  created_at
FROM ai_transaction_drafts
WHERE sender_phone IN ('+27603960790', '+27695446706')
ORDER BY created_at DESC
LIMIT 10;
```

**Check Webhook Processing**
```sql
SELECT 
  webhook_id,
  transaction_id,
  event_type,
  processed_at
FROM processed_webhooks
ORDER BY processed_at DESC
LIMIT 20;
```

**Check Error Logs**
```sql
SELECT 
  transaction_id,
  error_type,
  error_message,
  created_at
FROM error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Database State Log

For each test, record key database state:

```
[Scenario ID]: [Scenario Name]
Time: [HH:MM]

Transaction Table:
- ID: [UUID]
- Status: [status]
- Seller: [phone]
- Buyer: [phone]
- Amount: [amount]
- Created: [timestamp]

AI Drafts Table:
- [Yes/No, details if yes]

Processed Webhooks:
- [Count, recent entries]

Error Logs:
- [Any errors related to this test]

---
```

---

## 📈 TREND ANALYSIS

### Test Execution Trends

| Session | Date | Total | Passed | Failed | Pass Rate |
|---------|------|-------|--------|--------|-----------|
| 1 | | 38 | | | % |
| 2 | | 38 | | | % |
| 3 | | 38 | | | % |

### Common Failure Patterns

| Pattern | Occurrences | Scenarios Affected |
|---------|-------------|-------------------|
| | | |
| | | |
| | | |

---

## 🎯 ACCEPTANCE CRITERIA

### Production Release Criteria

- [ ] **100% Test Coverage** - All 38 scenarios executed
- [ ] **≥ 95% Pass Rate** - At most 2 failures allowed
- [ ] **0 Critical Bugs** - No P0 bugs open
- [ ] **≤ 2 High Priority Bugs** - Max 2 P1 bugs open
- [ ] **All Core Flows Pass** - HP-V1, HP-B1, HP-B2 must pass
- [ ] **Idempotency Verified** - EC-B8 must pass
- [ ] **Concurrent Handling** - EC-V12, EC-S5 must pass
- [ ] **Error Handling** - All system edge cases handled gracefully

### Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **QA Lead** | | | |
| **Product Owner** | | | |
| **Tech Lead** | | | |
| **Founder** | | | |

---

## 📝 FINAL REPORT TEMPLATE

### Executive Summary

**Test Period**: [Start Date] to [End Date]  
**Total Scenarios**: 38  
**Pass Rate**: ___%  
**Critical Issues**: ___  
**Production Ready**: ⬜ YES / ⬜ NO

### Key Findings

**Strengths**:
1. 
2. 
3. 

**Weaknesses**:
1. 
2. 
3. 

**Critical Issues**:
1. 
2. 
3. 

### Recommendations

**Must Fix Before Production**:
1. 
2. 
3. 

**Should Fix Soon**:
1. 
2. 
3. 

**Nice to Have**:
1. 
2. 
3. 

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |
| | | | |
| | | | |

### Go/No-Go Decision

**Decision**: ⬜ GO / ⬜ NO-GO

**Justification**:


**Conditions for GO** (if NO-GO):
1. 
2. 
3. 

---

## 🔄 CONTINUOUS IMPROVEMENT

### Lessons Learned

**What Went Well**:
1. 
2. 
3. 

**What Could Be Improved**:
1. 
2. 
3. 

**Action Items for Next Test Cycle**:
1. 
2. 
3. 

---

## 📞 SUPPORT CONTACTS

| Role | Name | Contact |
|------|------|---------|
| **QA Lead** | | |
| **Tech Lead** | | |
| **DevOps** | | |
| **Product Owner** | | |

---

**Report Generated**: [Date/Time]  
**Report Version**: 1.0  
**Next Review**: [Date]

