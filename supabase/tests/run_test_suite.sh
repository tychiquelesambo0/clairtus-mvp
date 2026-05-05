#!/bin/bash

# Clairtus Comprehensive Test Suite Runner

set -e

echo "🔧 Setting up environment for test suite..."

PROJECT_REF="wsavrjhfvfebghlzivvq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

echo "📡 Fetching Supabase keys..."
eval $(supabase projects api-keys --project-ref $PROJECT_REF -o env 2>/dev/null | grep -E "SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY")

if [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Failed to fetch Supabase keys"
  exit 1
fi

export SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
export E2E_TEST_KEY="clairtus_e2e_test_2026"
export ALLOW_NON_DRC_TEST_NUMBERS="true"

echo "✅ Environment configured"
echo ""

# Run the comprehensive test suite
echo "🚀 Running comprehensive E2E test suite..."
deno run --allow-net --allow-env --allow-read supabase/tests/e2e_test_suite.ts
