#!/bin/bash

# Complete Coverage Test Runner
# Tests all 38 scenarios for 100% coverage

set -e

echo "🔧 Setting up environment for complete coverage test..."

# Load environment variables
export SUPABASE_URL="https://wsavrjhfvfebghlzivvq.supabase.co"
export SUPABASE_ANON_KEY=$(supabase status --output json 2>/dev/null | jq -r '.anon_key' 2>/dev/null || echo "")
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json 2>/dev/null | jq -r '.service_role_key' 2>/dev/null || echo "")

# E2E Test bypass
export ALLOW_E2E_TEST_BYPASS=true
export E2E_TEST_KEY="clairtus_e2e_test_2026"

# South African test numbers (not DRC)
export ALLOW_NON_DRC_TEST_NUMBERS=true

echo "✅ Environment configured"
echo ""
echo "🚀 Running complete coverage test suite..."
echo ""

# Run the complete coverage test
deno run \
  --allow-net \
  --allow-env \
  --allow-read \
  supabase/tests/complete_coverage_test.ts

echo ""
echo "✅ Complete coverage test finished"
