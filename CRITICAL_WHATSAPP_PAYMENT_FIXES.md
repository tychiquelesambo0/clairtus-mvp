# 🚨 CRITICAL WHATSAPP & PAYMENT FIXES

**Date:** May 7, 2026, 9:56 AM UTC+2  
**Status:** 🔴 CRITICAL - TWO MAJOR ISSUES FOUND

---

## 🐛 ISSUE #1: BUYER NEVER RECEIVES PAYMENT INSTRUCTIONS

### **Root Cause:**
PawaPay for DRC mobile money does NOT return a `checkoutUrl`. Instead, they send a **PUSH notification** directly to the user's phone via USSD.

Our code was checking `if (checkoutUrl)` before sending a message to the buyer. Since there's no checkout URL for DRC, the buyer never received ANY message!

### **PawaPay Response for DRC:**
```json
{
  "depositId": "...",
  "status": "ACCEPTED",
  "created": "2026-05-07T..."
  // NO checkoutUrl field!
}
```

### **Fix Applied:** ✅
Updated `depositFlow.ts` to ALWAYS send a message to the buyer:
- **If checkoutUrl exists:** Send the URL
- **If NO checkoutUrl:** Tell buyer they'll receive a Mobile Money PUSH notification

### **New Buyer Message (without checkout URL):**
```
💳 Paiement requis

📱 Vous allez recevoir une notification Mobile Money sur votre téléphone +243824401073.

✅ Confirmez le paiement pour sécuriser vos fonds.

💡 Montant total : 1.02 USD (montant + frais opérateur).

🔒 Clairtus protège votre paiement jusqu'à la confirmation de livraison.
```

---

## 🐛 ISSUE #2: WHATSAPP MESSAGES NOT SENDING (CRITICAL!)

### **Root Cause:**
`META_ACCESS_TOKEN` and `META_PHONE_NUMBER_ID` are **MISSING** from Supabase environment variables!

Without these, **NO WhatsApp messages can be sent** - not to buyers, not to sellers, not to anyone!

### **Current Status:**
```json
{
  "META_ACCESS_TOKEN_SET": "NO - MISSING!",
  "META_PHONE_NUMBER_ID": "NO - MISSING!"
}
```

### **Impact:**
- ❌ Buyers don't receive payment instructions
- ❌ Sellers don't receive transaction notifications
- ❌ Counterparties don't receive acceptance/rejection messages
- ❌ NO WhatsApp communication works at all!

---

## ✅ IMMEDIATE ACTIONS REQUIRED

### **Action 1: Set WhatsApp Environment Variables**

You MUST add these to Supabase:

1. Go to: https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/functions

2. Add these environment variables:

   **`META_ACCESS_TOKEN`**
   - Get from: Facebook Business Manager → WhatsApp → API Setup
   - Should look like: `EAAxxxxxxxxxxxxx` (long token)

   **`META_PHONE_NUMBER_ID`**
   - Get from: Facebook Business Manager → WhatsApp → API Setup
   - Should look like: `123456789012345` (numeric ID)

3. Click **Save**

---

### **Action 2: Verify the Fix**

After adding the environment variables, run:

```bash
curl -s "https://wsavrjhfvfebghlzivvq.supabase.co/functions/v1/check-whatsapp-config" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```

**Expected:**
```json
{
  "META_ACCESS_TOKEN_SET": "Yes (XXX chars)",
  "META_PHONE_NUMBER_ID": "123456789012345",
  "WARNING": "Configuration looks OK"
}
```

---

### **Action 3: Test End-to-End**

1. Create a new transaction (vendor initiates)
2. Buyer accepts
3. **Expected:** Buyer receives WhatsApp message about Mobile Money PUSH
4. **Expected:** Buyer receives USSD prompt on their phone
5. Buyer confirms payment on their phone
6. **Expected:** Transaction moves to SECURED status

---

## 📋 WHAT'S BEEN DEPLOYED

**Functions Deployed:** ✅
- `state-machine` (v78) - with deposit flow fix
- `check-whatsapp-config` (v1) - diagnostic tool
- `debug-latest-transaction` (v1) - debugging tool

**Code Changes:** ✅
- `depositFlow.ts` - Always send buyer message (with or without checkout URL)
- Added diagnostic functions for troubleshooting

---

## 🎯 ROOT CAUSE SUMMARY

**Issue #1: No Buyer Message**
- **Cause:** Code expected `checkoutUrl` that doesn't exist for DRC
- **Fix:** Always send message, explain PUSH notification
- **Status:** ✅ DEPLOYED

**Issue #2: No WhatsApp Messages At All**
- **Cause:** Missing `META_ACCESS_TOKEN` and `META_PHONE_NUMBER_ID`
- **Fix:** YOU MUST ADD THESE TO SUPABASE
- **Status:** ⚠️ WAITING FOR YOU

---

## 🚨 CRITICAL NEXT STEPS

1. **GET YOUR WHATSAPP CREDENTIALS:**
   - Go to Facebook Business Manager
   - Navigate to WhatsApp API Setup
   - Copy `META_ACCESS_TOKEN`
   - Copy `META_PHONE_NUMBER_ID`

2. **ADD TO SUPABASE:**
   - Paste both values into Supabase environment variables
   - Save

3. **TEST:**
   - Run verification command
   - Create test transaction
   - Verify messages are sent

---

**Status:** 🟡 **CODE FIXED - WAITING FOR WHATSAPP CREDENTIALS**

**Without META_ACCESS_TOKEN and META_PHONE_NUMBER_ID, the bot CANNOT send ANY messages!**

**ADD THESE CREDENTIALS NOW!** 🚀
