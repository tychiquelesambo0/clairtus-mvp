-- ============================================
-- PRODUCTION DATA RESET SCRIPT
-- ============================================
-- Purpose: Delete all transactions and users except test users
-- Test Users: +27603960790, +27695446706
-- Date: May 6, 2026, 11:28 PM UTC+2
-- ============================================

-- Step 1: Delete all transactions (no exceptions needed - fresh start)
DELETE FROM transaction_status_log;
DELETE FROM transactions;

-- Step 2: Delete all users EXCEPT the 2 South African test numbers
DELETE FROM users 
WHERE phone_e164 NOT IN ('+27603960790', '+27695446706');

-- Step 3: Delete all error logs (fresh start)
DELETE FROM error_logs;

-- Step 4: Delete all WhatsApp delivery logs (fresh start)
DELETE FROM whatsapp_delivery_log;

-- Step 5: Reset any guided flow drafts
DELETE FROM guided_transaction_drafts;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check remaining users (should only be 2 test users)
SELECT phone_e164, display_name, created_at 
FROM users 
ORDER BY created_at DESC;

-- Check transactions (should be 0)
SELECT COUNT(*) as transaction_count FROM transactions;

-- Check transaction logs (should be 0)
SELECT COUNT(*) as log_count FROM transaction_status_log;

-- ============================================
-- EXPECTED RESULTS:
-- - users: 2 rows (+27603960790, +27695446706)
-- - transactions: 0 rows
-- - transaction_status_log: 0 rows
-- ============================================
