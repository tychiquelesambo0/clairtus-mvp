DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Missing table public.users. Apply base migrations first in this environment.';
  END IF;

  ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_phone_number_check;

  ALTER TABLE public.users
  ADD CONSTRAINT users_phone_number_check
  CHECK (phone_number ~ '^\+(243|27)[0-9]{9}$');
END $$;

DO $$
BEGIN
  IF to_regclass('public.messages_log') IS NULL THEN
    RAISE EXCEPTION
      'Missing table public.messages_log. Apply base migrations first in this environment.';
  END IF;

  ALTER TABLE public.messages_log
  DROP CONSTRAINT IF EXISTS messages_log_recipient_phone_check;

  ALTER TABLE public.messages_log
  ADD CONSTRAINT messages_log_recipient_phone_check
  CHECK (recipient_phone ~ '^\+(243|27)[0-9]{9}$');
END $$;
