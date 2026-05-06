# 🚀 CLAIRTUS PRODUCTION LAUNCH - STEP-BY-STEP GUIDE

**Date:** May 6, 2026  
**Status:** READY FOR PRODUCTION  
**PawaPay:** LIVE APPROVED ✅

---

## 📋 PRE-LAUNCH CHECKLIST

### Current Status:
- ✅ PawaPay Live Dashboard Approved
- ✅ All WhatsApp messages implemented (Unicorn Fintech copy)
- ✅ All duplicate messages fixed
- ✅ Webhook operational
- ⚠️ Currently allows South African test numbers (+27)
- ⚠️ PawaPay in SANDBOX mode
- ⚠️ Need to switch to DRC-only (+243) with test whitelist

---

## 🎯 PRODUCTION REQUIREMENTS

### 1. Phone Number Restrictions
- **Production:** Only +243 (DRC) numbers allowed
- **Test Whitelist:** 
  - `+27603960790` (Test Vendor)
  - `+27695446706` (Test Buyer)
- **Sandbox Mode:** Only applies to whitelisted test numbers
- **Live Mode:** All +243 numbers use real PawaPay

### 2. PawaPay Configuration
- **Environment:** PRODUCTION (not sandbox)
- **Base URL:** `https://api.pawapay.io` (live)
- **Correspondent:** `MTN_MOMO_COD` (DRC)
- **API Credentials:** Live API token (not sandbox)
- **Webhook Security:** Signed callbacks enabled

---

## 📝 STEP-BY-STEP SETUP

### PHASE 1: PAWAPAY LIVE CONFIGURATION

#### Step 1: Configure Callback URLs
**Location:** PawaPay Dashboard > Developers > Callback URLs

**Action Required:**
1. Go to: https://dashboard.pawapay.io/#/system/api-token/callback-url
2. Enter callback URLs for each operation:

**Deposits Callback URL:**
```
https://wsavrjhfvfebghlzivvq.supabase.co/functions/v1/pawapay-webhook
```

**Payouts Callback URL:**
```
https://wsavrjhfvfebghlzivvq.supabase.co/functions/v1/pawapay-webhook
```

**Refunds Callback URL:**
```
https://wsavrjhfvfebghlzivvq.supabase.co/functions/v1/pawapay-webhook
```

3. Click **Save**

**✅ Verification:** All three callbacks should show the same Supabase function URL

---

#### Step 2: Generate Live API Token
**Location:** PawaPay Dashboard > Developers > Create API Token

**Action Required:**
1. Go to: https://dashboard.pawapay.io/#/system/api-token/create
2. Click **Generate token**
3. **CRITICAL:** Copy the token immediately (shown only once!)
4. Store securely - you'll need this for Supabase environment variables

**Token Format:** Should start with `Bearer ` or be a long alphanumeric string

**✅ Verification:** Token copied and stored securely

---

#### Step 3: Enable Callback Signing (CRITICAL SECURITY)
**Location:** PawaPay Dashboard > Developers > API Security

**Action Required:**
1. Go to: https://dashboard.pawapay.io/#/system/api-token/security
2. Toggle **"Sign all callbacks"** to **ON** (blue)
3. Click **"Add public key"**
4. You'll need to generate and upload a public key (we'll do this in Phase 2)

**⚠️ HOLD:** Don't complete this step yet - we'll generate the keys first

---

### PHASE 2: GENERATE WEBHOOK SIGNATURE KEYS

#### Step 4: Generate RSA Key Pair for Webhook Verification

**Action Required:** Run these commands in your terminal:

```bash
cd /Users/cash/clairtus-mvp

# Generate private key (keep this SECRET!)
openssl genrsa -out pawapay_webhook_private.pem 2048

# Generate public key (upload to PawaPay)
openssl rsa -in pawapay_webhook_private.pem -pubout -out pawapay_webhook_public.pem

# Display public key (copy this to PawaPay dashboard)
cat pawapay_webhook_public.pem
```

**✅ Verification:** 
- `pawapay_webhook_private.pem` created (DO NOT COMMIT!)
- `pawapay_webhook_public.pem` created
- Public key displayed in terminal

---

#### Step 5: Upload Public Key to PawaPay

**Action Required:**
1. Copy the entire public key output (including `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`)
2. Go back to: https://dashboard.pawapay.io/#/system/api-token/security
3. Click **"Add public key"**
4. Paste the public key
5. Click **Save**

**✅ Verification:** Public key shows in "Your Public Keys" section

---

### PHASE 3: UPDATE SUPABASE ENVIRONMENT VARIABLES

#### Step 6: Add PawaPay Live Credentials to Supabase

**Location:** Supabase Dashboard > Settings > Edge Functions

**Action Required:**
1. Go to: https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/functions
2. Update/Add these secrets:

**CRITICAL - PRODUCTION CREDENTIALS:**

```bash
# PawaPay Live API
PAWAPAY_BASE_URL=https://api.pawapay.io
PAWAPAY_API_TOKEN=<YOUR_LIVE_API_TOKEN_FROM_STEP_2>

# PawaPay Correspondent (DRC MTN Mobile Money)
PAWAPAY_CORRESPONDENT=MTN_MOMO_COD

# Webhook Signature Verification (content of private key file)
PAWAPAY_WEBHOOK_PRIVATE_KEY=<PASTE_CONTENT_OF_pawapay_webhook_private.pem>

# Production Mode
APP_ENV=production
ALLOW_NON_DRC_TEST_NUMBERS=true

# Test Number Whitelist (comma-separated)
TEST_NUMBER_WHITELIST=+27603960790,+27695446706

# Transaction Limits (USD)
BCC_TOTAL_DEBIT_CAP_USD=2500
DEFAULT_PAYOUT_CAP_USD=2500

# Correspondent Limits (DRC MTN)
PAWAPAY_CORRESPONDENT_LIMITS_JSON={"MTN_MOMO_COD":{"total_debit_cap_usd":2500,"payout_cap_usd":2500,"mno_fee_rate":0.015}}
```

3. Click **Save** after adding each secret

**✅ Verification:** All secrets show as "Set" in Supabase dashboard

---

### PHASE 4: UPDATE CODE FOR PRODUCTION

#### Step 7: Update Phone Validation Logic

**File to modify:** `supabase/functions/_shared/phone.ts`

**Current behavior:** Allows +27 numbers (South Africa)
**Required behavior:** Only +243 (DRC) + whitelisted test numbers

**Changes needed:**
1. Enforce +243 for all non-whitelisted numbers
2. Allow +27603960790 and +27695446706 as test numbers
3. Route test numbers to sandbox mode
4. Route +243 numbers to live PawaPay

---

#### Step 8: Update PawaPay Client for Live Mode

**File to modify:** `supabase/functions/_shared/pawapayClient.ts`

**Changes needed:**
1. Add test number detection
2. Use sandbox correspondent for test numbers
3. Use live correspondent for +243 numbers
4. Implement webhook signature verification

---

#### Step 9: Update Deposit Flow for Test/Live Routing

**File to modify:** `supabase/functions/_shared/depositFlow.ts`

**Changes needed:**
1. Detect if phone is in test whitelist
2. If test: use sandbox mode, mark as auto-secured
3. If live: use real PawaPay API

---

#### Step 10: Update Payout Flow for Test/Live Routing

**File to modify:** `supabase/functions/_shared/payoutFlow.ts`

**Changes needed:**
1. Detect if phone is in test whitelist
2. If test: simulate payout success
3. If live: use real PawaPay API

---

### PHASE 5: DEPLOY AND TEST

#### Step 11: Deploy All Functions

**Action Required:**
```bash
cd /Users/cash/clairtus-mvp
./deploy.sh
```

**✅ Verification:** All functions deploy successfully

---

#### Step 12: Test with Whitelisted Numbers (Sandbox)

**Test Flow:**
1. Send "Bonjour" from +27603960790
2. Create test transaction (1 USD)
3. Verify it uses sandbox mode
4. Complete transaction
5. Verify payout works

**✅ Verification:** Test transaction completes end-to-end

---

#### Step 13: Test with Real DRC Number (LIVE - REAL MONEY!)

**⚠️ WARNING:** This will use REAL money from PawaPay!

**Test Flow:**
1. Send "Bonjour" from +243810000000 (or your real DRC number)
2. Create small transaction (1 USD)
3. Verify it uses LIVE PawaPay
4. Complete transaction with REAL mobile money
5. Verify payout works

**✅ Verification:** Real transaction completes with actual money movement

---

## 🔒 SECURITY CHECKLIST

Before going live, verify:

- [ ] PawaPay callback signing enabled
- [ ] Public key uploaded to PawaPay
- [ ] Private key stored securely in Supabase (not in code!)
- [ ] Webhook signature verification implemented
- [ ] Test numbers properly whitelisted
- [ ] Production API token (not sandbox) in Supabase
- [ ] All environment variables set correctly
- [ ] Phone validation enforces +243 only (except whitelist)
- [ ] No hardcoded credentials in code
- [ ] `.gitignore` includes `*.pem` files

---

## 🚨 CRITICAL REMINDERS

1. **NEVER commit private keys to Git**
   - Add `*.pem` to `.gitignore`
   - Store private key only in Supabase secrets

2. **Test numbers are SANDBOX ONLY**
   - +27603960790 and +27695446706 use fake money
   - All +243 numbers use REAL money

3. **PawaPay Live = Real Money**
   - Every deposit charges real mobile money account
   - Every payout sends real money
   - Test thoroughly with small amounts first!

4. **Idempotency is CRITICAL**
   - Always use transaction ID as Idempotency-Key
   - Prevents duplicate charges/payouts

5. **Monitor PawaPay Dashboard**
   - Check for failed transactions
   - Monitor float balance
   - Set up alerts for low balance

---

## 📊 POST-LAUNCH MONITORING

### Day 1 Checklist:
- [ ] Monitor Supabase logs for errors
- [ ] Check PawaPay dashboard for transaction status
- [ ] Verify webhook callbacks are received
- [ ] Test small real transaction
- [ ] Monitor float balance

### Week 1 Checklist:
- [ ] Review all transaction logs
- [ ] Check for any failed deposits/payouts
- [ ] Verify refund flow works
- [ ] Monitor user feedback
- [ ] Check error_logs table for issues

---

## 🆘 ROLLBACK PLAN

If something goes wrong:

1. **Immediate:** Set `APP_ENV=development` in Supabase
2. **Revert:** Deploy previous working version
3. **Investigate:** Check Supabase logs and PawaPay dashboard
4. **Fix:** Address issues in development
5. **Re-deploy:** Only after thorough testing

---

## 📞 SUPPORT CONTACTS

- **PawaPay Support:** support@pawapay.io
- **PawaPay Dashboard:** https://dashboard.pawapay.io
- **Supabase Dashboard:** https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq
- **Meta WhatsApp Support:** Via Meta Business Manager

---

**Ready to proceed?** Let's start with Phase 1, Step 1! 🚀
