#!/bin/bash

# Clairtus E2E Test Runner
# This script sets up the environment and runs the E2E simulator

set -e

echo "🔧 Setting up environment for E2E test..."

# Get Supabase project details
PROJECT_REF="wsavrjhfvfebghlzivvq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Get anon key from Supabase
echo "📡 Fetching Supabase keys..."
eval $(supabase projects api-keys --project-ref $PROJECT_REF -o env 2>/dev/null | grep -E "SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY")

if [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Failed to fetch Supabase keys. Please check your authentication."
  exit 1
fi

# For webhook signatures, we'll use test values since we can't extract actual secrets
echo "📡 Setting up test secrets..."
META_APP_SECRET="test_secret_for_e2e"
PAWAPAY_API_SECRET="test_pawapay_secret"

# Export environment variables
export SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
export META_APP_SECRET="$META_APP_SECRET"
export PAWAPAY_API_SECRET="$PAWAPAY_API_SECRET"
export ALLOW_NON_DRC_TEST_NUMBERS="true"

echo "✅ Environment configured"
echo "   SUPABASE_URL: $SUPABASE_URL"
echo "   Keys loaded: ✓"
echo ""

# Run the E2E test
echo "🚀 Running E2E simulation..."
deno run --allow-net --allow-env --allow-read supabase/tests/simulate_whatsapp_e2e.ts
