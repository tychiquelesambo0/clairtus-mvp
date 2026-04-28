CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON public.transactions (status);

CREATE INDEX IF NOT EXISTS idx_transactions_expires_at
  ON public.transactions (expires_at);

CREATE INDEX IF NOT EXISTS idx_transactions_seller_phone
  ON public.transactions (seller_phone);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer_phone
  ON public.transactions (buyer_phone);

CREATE INDEX IF NOT EXISTS idx_transaction_status_log_transaction_id
  ON public.transaction_status_log (transaction_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_error_type_occurred_at
  ON public.error_logs (error_type, occurred_at DESC);
