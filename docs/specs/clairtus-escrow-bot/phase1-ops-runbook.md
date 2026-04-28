# Phase 1 Operations Runbook (Tasks 1, 4, 5)

This runbook captures the reproducible operational steps completed locally and the remaining operator-only steps for Supabase dashboard credentials.

## Task 1 - Supabase Project + Local Runtime

### Completed in repository/local runtime

- `supabase/config.toml` exists and is valid.
- Local Supabase stack starts successfully with migrations applied.
- Verified runtime health with:

```sh
supabase start
supabase status
```

### Operator-only steps (dashboard)

1. Create or select the Supabase project in dashboard.
2. Copy `Project URL`, `anon`, and `service_role` keys.
3. Save values into local `.env` (never commit real secrets).
4. Link CLI to hosted project:

```sh
supabase login
supabase link --project-ref <your_project_ref>
```

## Task 4 - RLS Configuration + Runtime Testing

### Completed

- Migration `supabase/migrations/006_setup_rls.sql` is applied.
- Runtime smoke tests added:
  - `supabase/tests/phase1_rls_runtime_smoke.sql`

Run:

```sh
docker exec -i supabase_db_clairtus-mvp \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f - < "supabase/tests/phase1_rls_runtime_smoke.sql"
```

Expected result: script exits `0` and ends with `ROLLBACK`.

## Task 5 - Environment Variables + Secrets

### Completed in repository

- Required variables template exists in `.env.example`.
- Rotation procedure exists in `docs/specs/clairtus-escrow-bot/secret-rotation.md`.

### Operator-only secrets injection

1. Copy `.env.example` to `.env` and set real sandbox values:
   - Meta WhatsApp sandbox credentials
   - PawaPay sandbox credentials
   - Supabase URL and service keys
2. Push secrets to hosted Supabase project:

```sh
supabase secrets set --env-file .env
```

3. Verify secrets are registered:

```sh
supabase secrets list
```

4. Rotate per `secret-rotation.md`.
