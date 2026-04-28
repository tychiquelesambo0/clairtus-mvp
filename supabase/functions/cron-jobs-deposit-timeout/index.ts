// Shim entrypoint so Supabase CLI can deploy nested cron job code
// with a valid function name containing only letters/numbers/_/-.
import "../cron-jobs/deposit-timeout/index.ts";
