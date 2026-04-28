# Secret Rotation Procedures

This project uses Supabase Edge Functions with secrets stored in Supabase project secrets (never in git).

## Rotation Cadence

- Rotate all production secrets quarterly.
- Trigger immediate rotation for any suspected leak.
- Use a 7-day overlap window where provider supports dual credentials.

## Secrets In Scope

- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `PAWAPAY_API_KEY`
- `PAWAPAY_API_SECRET`

## Rotation Steps

1. Generate new secret in provider console (Meta/PawaPay/Supabase).
2. Add new value in Supabase secrets for non-production environment first.
3. Run smoke tests in sandbox (webhook verification, outbound WhatsApp, PawaPay auth).
4. Promote secret to production Supabase project secrets.
5. Re-run smoke tests in production-safe mode.
6. Revoke old secret after overlap window.

## Verification Checklist

- Webhook signature validation succeeds for Meta and PawaPay.
- Edge Functions can authenticate to Meta and PawaPay.
- No elevated auth failures in `error_logs` after rotation.

## Incident Response

If compromise is suspected:

1. Rotate affected secret immediately.
2. Revoke previous credential.
3. Review `error_logs` and provider audit logs for misuse.
4. Document incident timeline and mitigation actions.
