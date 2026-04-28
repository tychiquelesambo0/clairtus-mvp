ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_users ON public.users;
DROP POLICY IF EXISTS service_role_all_transactions ON public.transactions;
DROP POLICY IF EXISTS service_role_all_transaction_status_log ON public.transaction_status_log;
DROP POLICY IF EXISTS service_role_all_messages_log ON public.messages_log;
DROP POLICY IF EXISTS service_role_all_error_logs ON public.error_logs;

DROP POLICY IF EXISTS authenticated_all_users ON public.users;
DROP POLICY IF EXISTS authenticated_all_transactions ON public.transactions;
DROP POLICY IF EXISTS authenticated_all_transaction_status_log ON public.transaction_status_log;
DROP POLICY IF EXISTS authenticated_all_messages_log ON public.messages_log;
DROP POLICY IF EXISTS authenticated_all_error_logs ON public.error_logs;

CREATE POLICY service_role_all_users
ON public.users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_all_transactions
ON public.transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_all_transaction_status_log
ON public.transaction_status_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_all_messages_log
ON public.messages_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_all_error_logs
ON public.error_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY authenticated_all_users
ON public.users
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY authenticated_all_transactions
ON public.transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY authenticated_all_transaction_status_log
ON public.transaction_status_log
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY authenticated_all_messages_log
ON public.messages_log
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY authenticated_all_error_logs
ON public.error_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
