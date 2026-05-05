# Clairtus E2E Testing - Quick Reference Card

## 🚀 Run Tests

```bash
# Happy path (6 steps, ~20 seconds)
./supabase/tests/run_e2e.sh

# Full suite (5 edge cases, ~90 seconds)
./supabase/tests/run_test_suite.sh
```

## 📋 Test Scenarios

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| **Happy Path** | Complete transaction flow | Status: COMPLETED |
| **Buyer Rejects** | Buyer clicks REFUSER | Status: CANCELLED |
| **Seller Cancels** | Seller clicks ANNULER (before buyer accepts) | Status: CANCELLED |
| **PIN Failure** | 3 wrong PIN attempts | Status: PIN_FAILED_LOCKED |
| **AI Rejection** | Vendor clicks "Non, annuler" | No transaction created |
| **Invalid Phone** | Message with +1234567890 | No draft saved |

## 🔧 Prerequisites

```bash
# 1. Install Deno
brew install deno

# 2. Login to Supabase
supabase login

# 3. Set secrets (if not already set)
supabase secrets set ALLOW_E2E_TEST_BYPASS=true E2E_TEST_KEY=clairtus_e2e_test_2026

# 4. Deploy webhooks (if modified)
supabase functions deploy whatsapp-webhook
supabase functions deploy pawapay-webhook
```

## 🐛 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | E2E bypass not enabled | Check secrets: `supabase secrets list` |
| `Transaction not found` | Async delay too short | Increase sleep time in test |
| `Command not found: deno` | Deno not installed | Run `brew install deno` |
| `Failed to fetch keys` | Not logged in | Run `supabase login` |

## 📊 Success Indicators

✅ All HTTP responses: `200 OK`  
✅ Test output: `🎉 ALL TESTS PASSED!`  
✅ Exit code: `0`  
✅ Pass rate: `6/6` or `5/5`

## 🔍 Debug Commands

```bash
# View webhook logs
supabase functions logs whatsapp-webhook --tail

# Check recent transactions
psql $DATABASE_URL -c "SELECT id, status, seller_phone, buyer_phone FROM transactions ORDER BY created_at DESC LIMIT 5;"

# Verify secrets
supabase secrets list | grep -E "ALLOW_E2E|E2E_TEST_KEY"
```

## 📱 Test Phone Numbers

- **Vendor**: `+27603960790`
- **Buyer**: `+27695446706`
- **Invalid**: `+1234567890` (for negative tests)

## 🔐 Security Checklist (Before Production)

- [ ] Set `ALLOW_E2E_TEST_BYPASS=false`
- [ ] Remove or rotate `E2E_TEST_KEY`
- [ ] Verify webhook signatures enabled
- [ ] Disable test mode auto-payment

## 📖 Full Documentation

- **Testing Guide**: `supabase/tests/README.md`
- **Implementation Summary**: `E2E_TEST_SUMMARY.md`
- **Test Scripts**: `supabase/tests/`

## 🆘 Quick Help

```bash
# Re-run failed test
./supabase/tests/run_test_suite.sh

# Clean test data manually
psql $DATABASE_URL -c "DELETE FROM transactions WHERE seller_phone IN ('+27603960790', '+27695446706');"

# Check function deployment
supabase functions list

# View project info
supabase projects list
```

---

**Last Updated**: May 4, 2026  
**Status**: ✅ All Tests Passing (6/6)
