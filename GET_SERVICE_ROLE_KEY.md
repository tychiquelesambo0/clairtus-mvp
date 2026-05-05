# 🔑 How to Get Your Supabase Service Role Key

## Quick Method (2 minutes)

### Step 1: Open Supabase Dashboard

Go to: https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/api

### Step 2: Find Service Role Key

1. Scroll down to "Project API keys"
2. Look for **"service_role"** section
3. Click "Reveal" or the eye icon
4. Copy the key (starts with `eyJ...`)

### Step 3: Set Environment Variable

**Option A: Set for current terminal session**
```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

**Option B: Add to .env file** (recommended)
```bash
echo 'SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"' >> .env
```

**Option C: Add to .bashrc/.zshrc** (permanent)
```bash
echo 'export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### Step 4: Verify It's Set

```bash
echo $SUPABASE_SERVICE_ROLE_KEY
```

Should output your key (starts with `eyJ...`)

### Step 5: Run Tests Again

```bash
./supabase/tests/run_100_percent_test.sh
```

---

## Alternative: Use UAT Testing Instead

If you prefer not to set up the service role key right now, you can proceed with **Option 2: Manual UAT Testing** which doesn't require any keys:

1. Open `UAT_QUICK_START.md`
2. Follow the 5-minute setup
3. Start testing with your WhatsApp numbers

This is actually the recommended approach for comprehensive validation anyway! 🎯

---

## Security Note

⚠️ **IMPORTANT**: The service role key bypasses Row Level Security (RLS). 

- Never commit it to git
- Never share it publicly
- Only use it for testing/admin operations
- Keep it in `.env` (which is gitignored)

---

## Quick Copy-Paste

Once you have your key from the dashboard:

```bash
# Set it for this session
export SUPABASE_SERVICE_ROLE_KEY="paste-your-key-here"

# Then run tests
./supabase/tests/run_100_percent_test.sh
```

Done! ✅
