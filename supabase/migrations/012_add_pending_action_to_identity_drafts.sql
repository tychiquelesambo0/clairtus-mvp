ALTER TABLE public.user_identity_drafts
ADD COLUMN IF NOT EXISTS pending_message_type text
  CHECK (pending_message_type IN ('text', 'interactive_button')),
ADD COLUMN IF NOT EXISTS pending_text_body text,
ADD COLUMN IF NOT EXISTS pending_button_payload text;
