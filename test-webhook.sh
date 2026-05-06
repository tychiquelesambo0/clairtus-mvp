#!/bin/bash

# Clairtus WhatsApp Webhook Diagnostic Script

set -e

echo "🔍 CLAIRTUS WHATSAPP WEBHOOK DIAGNOSTICS"
echo "========================================"
echo ""

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
fi

WEBHOOK_URL="${SUPABASE_URL}/functions/v1/whatsapp-webhook"

echo "📍 Webhook URL: $WEBHOOK_URL"
echo ""

# Test 1: Verify webhook is accessible
echo "TEST 1: Checking if webhook is accessible..."
echo "--------------------------------------------"
VERIFY_TOKEN="${META_VERIFY_TOKEN:-test_token}"
CHALLENGE="test_challenge_123"

VERIFY_URL="${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}"

echo "Testing GET request for webhook verification..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$VERIFY_URL")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Webhook verification PASSED"
    echo "   Response: $BODY"
else
    echo "❌ Webhook verification FAILED"
    echo "   HTTP Status: $HTTP_STATUS"
    echo "   Response: $BODY"
fi
echo ""

# Test 2: Send a test message
echo "TEST 2: Sending test WhatsApp message..."
echo "--------------------------------------------"

# Create test payload
TEST_PAYLOAD='{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "TEST_ENTRY_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "27603960790",
          "phone_number_id": "TEST_PHONE_ID"
        },
        "messages": [{
          "from": "27603960790",
          "id": "wamid.TEST_MESSAGE_ID",
          "timestamp": "'$(date +%s)'",
          "type": "text",
          "text": {
            "body": "Bonjour"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'

# Calculate signature (if META_APP_SECRET is set)
if [ -n "$META_APP_SECRET" ]; then
    SIGNATURE=$(echo -n "$TEST_PAYLOAD" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | sed 's/^.* //')
    SIGNATURE_HEADER="sha256=$SIGNATURE"
    echo "Using signature: $SIGNATURE_HEADER"
    
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "x-hub-signature-256: $SIGNATURE_HEADER" \
        -d "$TEST_PAYLOAD")
else
    echo "⚠️  META_APP_SECRET not set, sending without signature..."
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "x-e2e-test-key: clairtus_e2e_test_2026" \
        -d "$TEST_PAYLOAD")
fi

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Test message SENT successfully"
    echo "   Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "❌ Test message FAILED"
    echo "   HTTP Status: $HTTP_STATUS"
    echo "   Response: $BODY"
fi
echo ""

# Test 3: Check Meta webhook configuration
echo "TEST 3: Meta Webhook Configuration Checklist"
echo "--------------------------------------------"
echo "Please verify the following in Meta Business Manager:"
echo ""
echo "1. Go to: https://developers.facebook.com/apps"
echo "2. Select your Clairtus app"
echo "3. Navigate to: WhatsApp > Configuration"
echo "4. Webhook section should have:"
echo "   ✓ Callback URL: $WEBHOOK_URL"
echo "   ✓ Verify Token: $META_VERIFY_TOKEN"
echo "   ✓ Webhook Fields: messages (subscribed)"
echo ""
echo "5. Test the webhook from Meta's interface:"
echo "   - Click 'Test' button next to the webhook URL"
echo "   - Should show 'Success' with challenge response"
echo ""

# Test 4: Check environment variables
echo "TEST 4: Environment Variables Check"
echo "--------------------------------------------"
echo "SUPABASE_URL: ${SUPABASE_URL:0:30}... ✓"
echo "META_VERIFY_TOKEN: ${META_VERIFY_TOKEN:+SET ✓}"
echo "META_APP_SECRET: ${META_APP_SECRET:+SET ✓}"
echo "META_WHATSAPP_TOKEN: ${META_WHATSAPP_TOKEN:+SET ✓}"
echo "META_WHATSAPP_PHONE_NUMBER_ID: ${META_WHATSAPP_PHONE_NUMBER_ID:+SET ✓}"
echo ""

# Test 5: Check if user exists in database
echo "TEST 5: Checking User Registration"
echo "--------------------------------------------"
echo "Checking if +27603960790 is registered..."
echo "(This requires database access - check Supabase dashboard)"
echo ""

echo "========================================"
echo "✅ DIAGNOSTICS COMPLETE"
echo ""
echo "NEXT STEPS:"
echo "1. If Test 1 passed but Test 2 failed → Check META_APP_SECRET"
echo "2. If both passed → Verify Meta webhook subscription"
echo "3. Check Supabase logs: https://supabase.com/dashboard/project/$(echo $SUPABASE_URL | sed 's/https:\/\///' | sed 's/.supabase.co//')/logs/edge-functions"
echo "4. Send 'Bonjour' from WhatsApp: +27603960790"
echo ""
