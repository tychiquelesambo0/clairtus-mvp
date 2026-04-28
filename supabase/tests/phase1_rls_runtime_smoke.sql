BEGIN;

-- Validate that RLS is enabled on all Phase 1 tables.
DO $$
DECLARE
  table_name TEXT;
  is_rls_enabled BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'transactions',
    'transaction_status_log',
    'messages_log',
    'error_logs'
  ]
  LOOP
    SELECT c.relrowsecurity
    INTO is_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = table_name;

    IF is_rls_enabled IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', table_name;
    END IF;
  END LOOP;
END
$$;

-- Validate policy presence for authenticated + service_role on each table.
DO $$
DECLARE
  table_name TEXT;
  role_name TEXT;
  policy_exists BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'transactions',
    'transaction_status_log',
    'messages_log',
    'error_logs'
  ]
  LOOP
    FOREACH role_name IN ARRAY ARRAY['authenticated', 'service_role']
    LOOP
      SELECT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = table_name
          AND p.roles::TEXT LIKE '%' || role_name || '%'
      )
      INTO policy_exists;

      IF policy_exists IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Missing RLS policy on public.% for role %', table_name, role_name;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- Behavioral check: authenticated and service_role can operate on users.
SET ROLE authenticated;
INSERT INTO public.users (phone_number) VALUES ('+243970000010');
DELETE FROM public.users WHERE phone_number = '+243970000010';
RESET ROLE;

SET ROLE service_role;
INSERT INTO public.users (phone_number) VALUES ('+243970000011');
DELETE FROM public.users WHERE phone_number = '+243970000011';
RESET ROLE;

-- Behavioral check: anon has no matching policy, so reads are empty.
SET ROLE anon;
DO $$
DECLARE
  visible_rows BIGINT;
BEGIN
  SELECT COUNT(*) INTO visible_rows FROM public.users;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'anon role unexpectedly saw % user row(s)', visible_rows;
  END IF;
END
$$;
RESET ROLE;

ROLLBACK;
