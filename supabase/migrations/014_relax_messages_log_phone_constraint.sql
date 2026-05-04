DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_log_recipient_phone_check'
      AND conrelid = 'public.messages_log'::regclass
  ) THEN
    ALTER TABLE public.messages_log
      DROP CONSTRAINT messages_log_recipient_phone_check;
  END IF;
END $$;

ALTER TABLE public.messages_log
  ADD CONSTRAINT messages_log_recipient_phone_check
  CHECK (recipient_phone ~ '^\+[1-9][0-9]{7,14}$');
