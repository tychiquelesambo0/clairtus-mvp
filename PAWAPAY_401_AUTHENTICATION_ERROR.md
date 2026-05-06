# 🚨 PAWAPAY 401 AUTHENTICATION ERROR

**Date:** May 7, 2026, 12:22 AM UTC+2  
**Status:** 🔴 CRITICAL - PawaPay API Key Invalid  
**Impact:** All real deposits failing

---

## 🐛 THE PROBLEM

**PawaPay Response:**
```json
{
  "ok": false,
  "status": 401,
  "errorCode": 2,
  "errorMessage": "Authentication error"
}
```

**Root Cause:** The `PAWAPAY_API_KEY` in Supabase is **invalid or expired**.

---

## ✅ THE FIX

### **Step 1: Generate New API Key**

1. Go to: **https://dashboard.pawapay.io**
2. Navigate to: **Developers > API Tokens**
3. Click: **Generate New Token**
4. Copy the new API key

---

### **Step 2: Update Supabase**

1. Go to: **https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/functions**

2. Find: `PAWAPAY_API_KEY`

3. **Replace with the new key** from Step 1

4. Click **Save**

---

### **Step 3: Test**

Run this command to verify:
```bash
curl -s "https://wsavrjhfvfebghlzivvq.supabase.co/functions/v1/test-pawapay-deposit" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+243976492939"}' | jq '.pawapay_response.ok'
```

**Expected:** `true` (not `false`)

---

## 📋 WHAT HAPPENED

1. ✅ Fixed `AUTO_MARK_PAYMENT_SECURED` bug (sandbox mode for all users)
2. ✅ Real PawaPay API is now being called
3. ❌ But PawaPay is rejecting with 401 Authentication error
4. ❌ This means the API key is invalid/expired

---

## 🧪 TEST RESULTS

**Test Phone:** +243976492939  
**Correspondent:** AIRTEL_OAPI_COD  
**Request:** Valid deposit request  
**Response:** 401 Authentication error  

**Diagnosis:** API key is the problem, not the code logic.

---

## ✅ AFTER YOU UPDATE THE KEY

Once you update `PAWAPAY_API_KEY`:

1. Run the test command above
2. Should return `"ok": true`
3. Test with a real transaction
4. Buyer should receive checkout URL
5. No more "initiation du paiement a échoué" errors

---

## 🎯 SUMMARY

**Problem:** PawaPay API key is invalid/expired  
**Impact:** All deposits failing with 401 error  
**Fix:** Generate new API key in PawaPay dashboard and update Supabase  
**Time to fix:** 2 minutes  

**GO UPDATE THE API KEY NOW!** 🚀
