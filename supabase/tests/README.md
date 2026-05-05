# Clairtus E2E Testing Documentation

## Overview

This directory contains comprehensive end-to-end (E2E) tests for the Clairtus WhatsApp Escrow Bot. The tests simulate real user interactions through the WhatsApp webhook API and verify the entire transaction flow from creation to completion.

## Test Architecture

### Test Bypass Mode

To enable E2E testing without requiring actual Meta WhatsApp signatures, we've implemented a **test bypass mode**:

- **Environment Variables**:
  - `ALLOW_E2E_TEST_BYPASS=true` - Enables bypass mode (set in Supabase secrets)
  - `E2E_TEST_KEY=clairtus_e2e_test_2026` - Secret key for bypass authentication

- **Implementation**: Both `whatsapp-webhook` and `pawapay-webhook` check for the `x-e2e-test-key` header. If it matches the configured key and bypass is enabled, signature validation is skipped.

- **Security**: This bypass is **only for development/testing**. In production, ensure `ALLOW_E2E_TEST_BYPASS` is set to `false` or removed.

## Test Files

### 1. `simulate_whatsapp_e2e.ts`
**Purpose**: Tests the complete happy-path transaction flow.

**Scenario**:
1. Vendor sends AI-parsed message: "Je veux vendre MacBook Air M1 à 50$ au +27695446706"
2. AI extracts intent, amount, phone, and item
3. Vendor confirms AI prefill by clicking "Oui, continuer"
4. Transaction created in INITIATED state
5. Buyer accepts transaction by clicking "ACCEPTER"
6. Transaction moves to SECURED (auto-payment in test mode)
7. PawaPay deposit webhook simulated
8. Vendor submits correct PIN
9. Transaction completes (COMPLETED state)

**Run**: `./supabase/tests/run_e2e.sh`

### 2. `e2e_test_suite.ts`
**Purpose**: Comprehensive test suite covering edge cases and error scenarios.

**Test Cases**:

#### Test 1: Buyer Rejects Transaction
- Vendor creates transaction via AI
- Vendor confirms AI prefill
- **Buyer clicks "REFUSER"**
- ✅ Verifies transaction moves to CANCELLED state

#### Test 2: Seller Cancels Transaction Before Buyer Accepts
- Vendor creates transaction
- **Seller clicks "ANNULER" before buyer responds**
- ✅ Verifies transaction moves to CANCELLED state
- **Note**: Cancellation only works in INITIATED or PENDING_FUNDING states

#### Test 3: PIN Failure Flow (3 Wrong Attempts)
- Transaction created and secured
- Vendor submits wrong PIN (attempt 1)
- Vendor submits wrong PIN (attempt 2)
- Vendor submits wrong PIN (attempt 3)
- ✅ Verifies transaction moves to PIN_FAILED_LOCKED state

#### Test 4: AI Prefill Rejection
- Vendor sends AI message
- **Vendor clicks "Non, annuler"** to reject AI prefill
- ✅ Verifies no transaction is created
- ✅ Verifies AI draft is deleted

#### Test 5: Invalid Phone Number Handling
- Vendor sends message with invalid phone (e.g., +1234567890)
- AI extraction fails phone normalization
- ✅ Verifies no AI draft is saved
- ✅ Verifies confirmation attempt fails with "no draft" error
- ✅ Verifies no transaction is created

**Run**: `./supabase/tests/run_test_suite.sh`

## Test Environment

### South African Testing Constraints

The system is currently configured for testing in **Cape Town, South Africa**:

- **Test Phone Numbers**:
  - Vendor: `+27603960790`
  - Buyer: `+27695446706`

- **Phone Validation**: 
  - `ALLOW_NON_DRC_TEST_NUMBERS=true` allows South African (+27) numbers
  - Eventually will enforce DRC (+243) numbers in production

- **PawaPay**: Strictly in **SANDBOX MODE**

### Database State Management

Each test:
1. **Cleans up** previous test data (transactions, AI drafts, guided drafts)
2. **Ensures** test users exist with proper identity
3. **Verifies** state transitions via database queries
4. **Waits** for async processing (2-3 second delays between steps)

## Running Tests

### Prerequisites

1. **Deno installed**: `brew install deno`
2. **Supabase CLI authenticated**: `supabase login`
3. **Environment secrets configured**:
   ```bash
   supabase secrets set ALLOW_E2E_TEST_BYPASS=true E2E_TEST_KEY=clairtus_e2e_test_2026
   ```
4. **Webhooks deployed**:
   ```bash
   supabase functions deploy whatsapp-webhook
   supabase functions deploy pawapay-webhook
   ```

### Quick Start

```bash
# Run happy-path test
./supabase/tests/run_e2e.sh

# Run comprehensive test suite
./supabase/tests/run_test_suite.sh
```

### Manual Test Execution

```bash
# Set environment variables
export SUPABASE_URL="https://wsavrjhfvfebghlzivvq.supabase.co"
export SUPABASE_ANON_KEY="your_anon_key"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export E2E_TEST_KEY="clairtus_e2e_test_2026"

# Run specific test
deno run --allow-net --allow-env --allow-read supabase/tests/simulate_whatsapp_e2e.ts
deno run --allow-net --allow-env --allow-read supabase/tests/e2e_test_suite.ts
```

## Test Results Interpretation

### Success Indicators
- ✅ All HTTP responses return 200 status
- ✅ Database state matches expected transaction status
- ✅ AI drafts created/deleted as expected
- ✅ Error messages match expected validation failures

### Common Failure Modes

#### 401 Unauthorized
- **Cause**: E2E bypass not enabled or wrong test key
- **Fix**: Verify `ALLOW_E2E_TEST_BYPASS=true` and `E2E_TEST_KEY` are set

#### Transaction Status Mismatch
- **Cause**: Async processing not complete
- **Fix**: Increase sleep delays between steps (currently 2000ms)

#### "No transaction found"
- **Cause**: Database cleanup issue or transaction creation failed
- **Fix**: Check webhook logs in Supabase dashboard

#### "AI draft not found"
- **Cause**: AI extraction failed or phone validation rejected
- **Fix**: Verify phone number format and AI extraction logic

## Debugging

### View Webhook Logs
```bash
# Supabase Dashboard
https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/functions

# Or via CLI
supabase functions logs whatsapp-webhook
supabase functions logs pawapay-webhook
```

### Inspect Database State
```sql
-- View recent transactions
SELECT id, status, seller_phone, buyer_phone, base_amount, created_at 
FROM transactions 
WHERE seller_phone IN ('+27603960790', '+27695446706') 
   OR buyer_phone IN ('+27603960790', '+27695446706')
ORDER BY created_at DESC 
LIMIT 10;

-- View AI drafts
SELECT * FROM ai_transaction_drafts 
WHERE phone_number IN ('+27603960790', '+27695446706');

-- View transaction status log
SELECT * FROM transaction_status_log 
WHERE transaction_id = 'your-transaction-id' 
ORDER BY created_at DESC;
```

### Enable Verbose Logging
The test scripts output detailed logs for each step:
- 📤 Outgoing webhook calls
- 📥 Webhook responses
- ✅ Successful verifications
- ❌ Failed assertions
- 🔐 Generated PINs (for PIN tests)

## Continuous Integration

### GitHub Actions (Future)
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - name: Run E2E Tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          E2E_TEST_KEY: ${{ secrets.E2E_TEST_KEY }}
        run: ./supabase/tests/run_test_suite.sh
```

## Best Practices

### When to Run Tests
- ✅ Before deploying to production
- ✅ After modifying webhook logic
- ✅ After changing state machine transitions
- ✅ After updating AI extraction logic
- ✅ After database schema migrations

### Test Data Hygiene
- Always clean up test data before each test
- Use consistent test phone numbers
- Verify database state after each critical step
- Don't rely on test data persisting between runs

### Adding New Tests
1. Create test function in `e2e_test_suite.ts`
2. Follow naming convention: `test_DescriptiveName()`
3. Include cleanup, setup, execution, and verification steps
4. Add to main test runner with descriptive name
5. Document the test scenario in this README

## Troubleshooting

### Test Hangs or Times Out
- Check if Supabase functions are deployed and running
- Verify network connectivity to Supabase
- Increase `WaitDurationSeconds` in command_status calls

### Flaky Tests
- Increase sleep delays between async operations
- Add retry logic for network calls
- Verify database state before assertions

### Environment Issues
- Ensure all secrets are set: `supabase secrets list`
- Verify project reference: `supabase projects list`
- Check function deployment: `supabase functions list`

## Support

For questions or issues:
1. Check Supabase function logs
2. Review transaction_status_log table
3. Verify environment variables are set correctly
4. Contact the development team with test output logs

---

**Last Updated**: May 4, 2026  
**Test Coverage**: 6 scenarios (1 happy path + 5 edge cases)  
**Pass Rate**: 100% (6/6 tests passing)
