-- Migration: Add REFUNDED status to transactions table
-- Date: 2026-05-04
-- Purpose: Enable refund flow by adding REFUNDED as a valid transaction status

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
