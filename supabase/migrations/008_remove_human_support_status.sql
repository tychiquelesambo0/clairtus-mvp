DO $$
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    RAISE EXCEPTION
      'Missing table public.transactions. Apply base migrations first in this environment.';
  END IF;

  ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

  ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (
    status IN (
      'INITIATED',
      'PENDING_FUNDING',
      'SECURED',
      'COMPLETED',
      'CANCELLED',
      'PIN_FAILED_LOCKED',
      'PAYOUT_FAILED',
      'PAYOUT_DELAYED'
    )
  );
END $$;
