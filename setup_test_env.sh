#!/bin/bash

# Quick setup script for test environment

echo "🔧 Setting up test environment..."

# Check if service role key exists in subdirectory .env.local
if [ -f "docs/specs/clairtus-escrow-bot/.env.local" ]; then
  echo "📄 Found .env.local in docs/specs/clairtus-escrow-bot/"
  
  # Extract the service role key
  SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY docs/specs/clairtus-escrow-bot/.env.local | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
  
  if [ ! -z "$SERVICE_KEY" ] && [ "$SERVICE_KEY" != "your-service-role-key-here" ]; then
    echo "✅ Found service role key, copying to root .env.local..."
    
    # Create .env.local in root with the key
    cat > .env.local << EOF
# Supabase Configuration for Testing
SUPABASE_URL=https://wsavrjhfvfebghlzivvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY

# E2E Testing
ALLOW_E2E_TEST_BYPASS=true
E2E_TEST_KEY=clairtus_e2e_test_2026
ALLOW_NON_DRC_TEST_NUMBERS=true
EOF
    
    echo "✅ .env.local created in project root!"
    echo ""
    echo "🚀 You can now run the tests:"
    echo "   ./supabase/tests/run_100_percent_test.sh"
  else
    echo "❌ Service role key not found or not set properly"
    echo ""
    echo "Please set SUPABASE_SERVICE_ROLE_KEY in:"
    echo "  docs/specs/clairtus-escrow-bot/.env.local"
    echo ""
    echo "Or get it from:"
    echo "  https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/api"
  fi
else
  echo "❌ .env.local not found in docs/specs/clairtus-escrow-bot/"
  echo ""
  echo "Please create it or get your service role key from:"
  echo "  https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/api"
  echo ""
  echo "Then create .env.local in project root with:"
  echo "  SUPABASE_SERVICE_ROLE_KEY=your-key-here"
fi
