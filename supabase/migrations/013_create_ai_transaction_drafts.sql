CREATE TABLE IF NOT EXISTS public.ai_transaction_drafts (
  phone_number text PRIMARY KEY,
  intent text NOT NULL CHECK (intent IN ('VENDRE', 'ACHETER')),
  amount_usd numeric(10,2) NOT NULL CHECK (amount_usd > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  counterparty_phone text NOT NULL,
  item_description text,
  raw_user_text text NOT NULL,
  extracted_payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_transaction_drafts_updated_at
  ON public.ai_transaction_drafts (updated_at DESC);

ALTER TABLE public.ai_transaction_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_ai_transaction_drafts ON public.ai_transaction_drafts;
CREATE POLICY service_role_all_ai_transaction_drafts
ON public.ai_transaction_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
