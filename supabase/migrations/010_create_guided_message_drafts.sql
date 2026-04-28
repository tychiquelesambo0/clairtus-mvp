CREATE TABLE IF NOT EXISTS public.guided_message_drafts (
  phone_number text PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('SELL', 'BUY')),
  stage text NOT NULL CHECK (stage IN ('AWAITING_ITEM', 'AWAITING_PRICE', 'AWAITING_COUNTERPARTY_PHONE')),
  item_description text,
  amount_usd numeric(10,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guided_message_drafts_updated_at
  ON public.guided_message_drafts (updated_at DESC);

ALTER TABLE public.guided_message_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_guided_message_drafts ON public.guided_message_drafts;
CREATE POLICY service_role_all_guided_message_drafts
ON public.guided_message_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
