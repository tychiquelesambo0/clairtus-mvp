CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.users (
  phone_number VARCHAR(20) PRIMARY KEY CHECK (phone_number ~ '^\+243[0-9]{9}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  successful_transactions INTEGER NOT NULL DEFAULT 0 CHECK (successful_transactions >= 0),
  cancelled_transactions INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_transactions >= 0),
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  last_transaction_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_is_suspended_true
  ON public.users (is_suspended)
  WHERE is_suspended = TRUE;
