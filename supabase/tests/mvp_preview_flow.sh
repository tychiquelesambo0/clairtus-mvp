#!/usr/bin/env bash

set -euo pipefail

LOCAL_SUPABASE_URL="${LOCAL_SUPABASE_URL:-http://127.0.0.1:55321}"
SUPABASE_FUNCTIONS_BASE="${LOCAL_SUPABASE_URL}/functions/v1"
SUPABASE_REST_BASE="${LOCAL_SUPABASE_URL}/rest/v1"

SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
META_APP_SECRET="${META_APP_SECRET:-}"
PAWAPAY_API_SECRET="${PAWAPAY_API_SECRET:-}"

SELLER_PHONE="${SELLER_PHONE:-+243970000001}"
BUYER_PHONE="${BUYER_PHONE:-+243970000002}"
AMOUNT_USD="${AMOUNT_USD:-125}"
ITEM_TEXT="${ITEM_TEXT:-Smartphone test}"

if [[ -z "${META_APP_SECRET}" ]]; then
  echo "Missing META_APP_SECRET. Export it before running preview." >&2
  exit 1
fi

if [[ -z "${PAWAPAY_API_SECRET}" ]]; then
  echo "Missing PAWAPAY_API_SECRET. Export it before running preview." >&2
  exit 1
fi

if [[ -z "${SUPABASE_ANON_KEY}" ]]; then
  echo "SUPABASE_ANON_KEY not set. Calls may fail if gateway requires apikey." >&2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for JSON extraction." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required for webhook signature generation." >&2
  exit 1
fi

if ! command -v xxd >/dev/null 2>&1; then
  echo "xxd is required for hex conversion." >&2
  exit 1
fi

json_pretty() {
  python3 -m json.tool
}

sign_sha256_hex() {
  local body="$1"
  local secret="$2"
  printf "%s" "${body}" \
    | openssl dgst -sha256 -hmac "${secret}" -binary \
    | xxd -p -c 256
}

curl_function_json() {
  local function_name="$1"
  local body="$2"
  local output_file="$3"

  local -a headers=(-H "Content-Type: application/json")
  if [[ -n "${SUPABASE_ANON_KEY}" ]]; then
    headers+=(-H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")
  fi

  curl -sS \
    -X POST "${SUPABASE_FUNCTIONS_BASE}/${function_name}" \
    "${headers[@]}" \
    --data "${body}" \
    > "${output_file}"
}

curl_webhook_json() {
  local function_name="$1"
  local body="$2"
  local signature_header="$3"
  local signature_value="$4"
  local output_file="$5"

  local -a headers=(-H "Content-Type: application/json" -H "${signature_header}: ${signature_value}")
  if [[ -n "${SUPABASE_ANON_KEY}" ]]; then
    headers+=(-H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")
  fi

  curl -sS \
    -X POST "${SUPABASE_FUNCTIONS_BASE}/${function_name}" \
    "${headers[@]}" \
    --data "${body}" \
    > "${output_file}"
}

echo "== MVP Preview Flow =="
echo "Supabase URL: ${LOCAL_SUPABASE_URL}"
echo "Seller: ${SELLER_PHONE}"
echo "Buyer: ${BUYER_PHONE}"
echo

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

CREATE_PAYLOAD="$(cat <<EOF
{"action":"create_transaction","sender_phone":"${SELLER_PHONE}","message_text":"Vente ${AMOUNT_USD} USD ${ITEM_TEXT} au ${BUYER_PHONE}"}
EOF
)"

CREATE_RESPONSE_FILE="${TMP_DIR}/01_create_transaction.json"
curl_function_json "state-machine" "${CREATE_PAYLOAD}" "${CREATE_RESPONSE_FILE}"
echo "1) create_transaction response:"
json_pretty < "${CREATE_RESPONSE_FILE}"

TRANSACTION_ID="$(
  python3 - "${CREATE_RESPONSE_FILE}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    payload = json.load(f)

tx_id = (
    payload.get("transaction", {})
    .get("transaction", {})
    .get("id")
)
if not tx_id:
    raise SystemExit(1)
print(tx_id)
PY
)"

if [[ -z "${TRANSACTION_ID}" ]]; then
  echo "Could not extract transaction ID from create_transaction response." >&2
  exit 1
fi

echo
echo "Extracted transaction_id: ${TRANSACTION_ID}"
echo

BUYER_WA_ID="${BUYER_PHONE#+}"
WHATSAPP_ACCEPT_PAYLOAD="$(cat <<EOF
{"entry":[{"changes":[{"value":{"messages":[{"from":"${BUYER_WA_ID}","type":"text","text":{"body":"ACCEPTER ${TRANSACTION_ID}"}}]}}]}]}
EOF
)"

META_SIG_HEX="$(sign_sha256_hex "${WHATSAPP_ACCEPT_PAYLOAD}" "${META_APP_SECRET}")"
WHATSAPP_RESPONSE_FILE="${TMP_DIR}/02_whatsapp_accept.json"
curl_webhook_json \
  "whatsapp-webhook" \
  "${WHATSAPP_ACCEPT_PAYLOAD}" \
  "x-hub-signature-256" \
  "sha256=${META_SIG_HEX}" \
  "${WHATSAPP_RESPONSE_FILE}"

echo "2) whatsapp-webhook (ACCEPTER) response:"
json_pretty < "${WHATSAPP_RESPONSE_FILE}"
echo

DEPOSIT_WEBHOOK_PAYLOAD="$(cat <<EOF
{"type":"deposit.completed","idempotencyKey":"${TRANSACTION_ID}","depositId":"dep-${TRANSACTION_ID}","status":"COMPLETED"}
EOF
)"

PAWA_DEPOSIT_SIG_HEX="$(sign_sha256_hex "${DEPOSIT_WEBHOOK_PAYLOAD}" "${PAWAPAY_API_SECRET}")"
DEPOSIT_RESPONSE_FILE="${TMP_DIR}/03_pawapay_deposit.json"
curl_webhook_json \
  "pawapay-webhook" \
  "${DEPOSIT_WEBHOOK_PAYLOAD}" \
  "x-signature" \
  "${PAWA_DEPOSIT_SIG_HEX}" \
  "${DEPOSIT_RESPONSE_FILE}"

echo "3) pawapay-webhook (deposit success) response:"
json_pretty < "${DEPOSIT_RESPONSE_FILE}"
echo

PAYOUT_WEBHOOK_PAYLOAD="$(cat <<EOF
{"type":"payout.completed","idempotencyKey":"${TRANSACTION_ID}","payoutId":"pay-${TRANSACTION_ID}","status":"COMPLETED"}
EOF
)"

PAWA_PAYOUT_SIG_HEX="$(sign_sha256_hex "${PAYOUT_WEBHOOK_PAYLOAD}" "${PAWAPAY_API_SECRET}")"
PAYOUT_RESPONSE_FILE="${TMP_DIR}/04_pawapay_payout.json"
curl_webhook_json \
  "pawapay-webhook" \
  "${PAYOUT_WEBHOOK_PAYLOAD}" \
  "x-signature" \
  "${PAWA_PAYOUT_SIG_HEX}" \
  "${PAYOUT_RESPONSE_FILE}"

echo "4) pawapay-webhook (payout success) response:"
json_pretty < "${PAYOUT_RESPONSE_FILE}"
echo

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY}" ]]; then
  echo "5) Final transaction snapshot:"
  curl -sS \
    "${SUPABASE_REST_BASE}/transactions?id=eq.${TRANSACTION_ID}&select=id,status,requires_human,base_amount,mno_fee,clairtus_fee,pawapay_deposit_id,pawapay_payout_id,updated_at" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | json_pretty
  echo

  echo "6) Status log trail snapshot:"
  curl -sS \
    "${SUPABASE_REST_BASE}/transaction_status_log?transaction_id=eq.${TRANSACTION_ID}&select=old_status,new_status,event,reason,changed_at&order=changed_at.asc" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | json_pretty
  echo
else
  echo "SUPABASE_SERVICE_ROLE_KEY not set; skipping REST snapshots."
fi

echo "MVP preview flow complete."
echo "Transaction ID: ${TRANSACTION_ID}"
