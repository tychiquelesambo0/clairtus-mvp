ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text;

CREATE TABLE IF NOT EXISTS public.user_identity_drafts (
  phone_number text PRIMARY KEY,
  stage text NOT NULL CHECK (stage IN ('AWAITING_FIRST_NAME', 'AWAITING_LAST_NAME')),
  first_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_identity_drafts_updated_at
  ON public.user_identity_drafts (updated_at DESC);

ALTER TABLE public.user_identity_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_user_identity_drafts ON public.user_identity_drafts;
CREATE POLICY service_role_all_user_identity_drafts
ON public.user_identity_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
