#!/bin/bash

# 100% Automated Test Coverage Runner
# Validates all 38 scenarios with full automation

set -e

echo "🔧 Setting up environment for 100% automated test coverage..."

# Load environment variables from .env.local or .env if they exist
if [ -f .env.local ]; then
  echo "📄 Loading environment from .env.local..."
  export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
  echo "📄 Loading environment from .env..."
  export $(grep -v '^#' .env | xargs)
fi

# Load environment variables
export SUPABASE_URL="https://wsavrjhfvfebghlzivvq.supabase.co"

# Try to get keys from environment or supabase status
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  export SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json 2>/dev/null | jq -r '.service_role_key' 2>/dev/null || echo "")
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
  export SUPABASE_ANON_KEY=$(supabase status --output json 2>/dev/null | jq -r '.anon_key' 2>/dev/null || echo "")
fi

# Check if keys are set
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set"
  echo "Please set it in your environment or .env file"
  exit 1
fi

# E2E Test bypass
export ALLOW_E2E_TEST_BYPASS=true
export E2E_TEST_KEY="clairtus_e2e_test_2026"

# South African test numbers (not DRC)
export ALLOW_NON_DRC_TEST_NUMBERS=true

echo "✅ Environment configured"
echo ""
echo "🚀 Running 100% automated test coverage..."
echo ""

# Run the 100% coverage test
deno run \
  --allow-net \
  --allow-env \
  --allow-read \
  supabase/tests/100_percent_coverage_test.ts

echo ""
echo "✅ 100% automated test coverage complete"
