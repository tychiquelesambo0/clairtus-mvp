-- ============================================================================
-- APPLY ALL PENDING MIGRATIONS
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================================

-- MIGRATION 015: Add REFUNDED status
-- ============================================================================

-- Drop the existing CHECK constraint
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_status_check;

-- Add the new CHECK constraint with REFUNDED status
ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_status_check 
CHECK (status IN (
  'INITIATED',
  'PENDING_FUNDING',
  'SECURED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'PIN_FAILED_LOCKED',
  'PAYOUT_FAILED',
  'PAYOUT_DELAYED'
));

-- Add comment for documentation
COMMENT ON CONSTRAINT transactions_status_check ON public.transactions IS 
'Valid transaction statuses including REFUNDED for completed refund operations';

-- ============================================================================
-- MIGRATION 016: Create processed_webhooks table
-- ============================================================================

-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create processed_webhooks table
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id VARCHAR(255) NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id, event_type)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_lookup 
ON public.processed_webhooks(webhook_id, event_type);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_transaction 
ON public.processed_webhooks(transaction_id);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at 
ON public.processed_webhooks(processed_at);

-- Add comments for documentation
COMMENT ON TABLE public.processed_webhooks IS 
'Tracks processed webhook events to prevent duplicate processing and ensure idempotency';

COMMENT ON COLUMN public.processed_webhooks.webhook_id IS 
'Unique identifier from the webhook provider (PawaPay depositId, payoutId, refundId, etc.)';

COMMENT ON COLUMN public.processed_webhooks.event_type IS 
'Type of webhook event (DEPOSIT, PAYOUT, REFUND, etc.)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify REFUNDED status is available
SELECT 
  constraint_name, 
  check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'transactions_status_check';

-- Verify processed_webhooks table exists
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'processed_webhooks'
ORDER BY ordinal_position;

-- Show success message
SELECT '✅ All migrations applied successfully!' as status;
