# 🔐 SUPABASE PRODUCTION ENVIRONMENT VARIABLES

**CRITICAL:** Add these to Supabase Dashboard > Settings > Edge Functions

**URL:** https://supabase.com/dashboard/project/wsavrjhfvfebghlzivvq/settings/functions

---

## 📋 ENVIRONMENT VARIABLES TO ADD/UPDATE

### 1. PawaPay Production API
```bash
PAWAPAY_BASE_URL=https://api.pawapay.io
```

### 2. PawaPay Live API Token
```bash
PAWAPAY_API_TOKEN=<PASTE_YOUR_LIVE_API_TOKEN_HERE>
```
**⚠️ Use the token you generated in Step 2!**

### 3. PawaPay Correspondent (DRC MTN)
```bash
PAWAPAY_CORRESPONDENT=MTN_MOMO_COD
```

### 4. PawaPay Webhook Private Key (for signature verification)
```bash
PAWAPAY_WEBHOOK_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCwuuyNfRESlKkx
AZUGtl+bi330BZCDgQt3pSImFSQ3XkkVNqUUtJqcv4wRLQ9T2p7DCmtixFBrW3ux
VSJjnNDgMcA74YcFj8LIZvzQ6FagNMdbPz5unRUn/wFYo+HWB6PhuANi3ZRoFlnU
R3cP88hABmNFM8V1fmI7SA4++yiJ+mDybrWxiIRv8YyyGUqwI4AxJGI7Hhz4iyS6
8zd+QIH2Qm8n/J0ooHRfJ9eF/ASctzasbBneM5gR7UX/x70f8DknA5s/3sv/1dYN
J9//1rtVlCwIKq/PwLlbIO+5pOep6DIatOqfYQVQt/QtSM/ewjBy9jXYXIGLoTDZ
T4XQsfybAgMBAAECggEAITXnOQltGWRFTRfChQHlgonaj+4xw3yPBptKCQUFCsCV
lD5yFCuCOH2IWTvx+uyE1BsTpfpFMH9/BYp9jWGNIOxIdxhA8ssaq+UqkilvCekR
I3UFiuzK6nqxqpIVYM6LveGCBWSlPFAi7lDFr4I8ucdZhUoey58F36UBRFWXPyI1
cJIb6sALK9CflkGirLK3pwGh4LPUwS5MiAMzaOS6kP+IhC4J1xREAswVbbk+oHEd
/+jKZpHOpkVo7yhx9aTWgdxFx71a8XBqTAdyvea/NEHzcpSNsXx3c3v8giKJh4Wf
fNcBy1vH2zUTV7dcK2UcYwQCsYviUQFhWMnm6hwJTQKBgQDc9IvxdSdwHQg+Q8yY
cS/fQxmGtEZzh3YprfXHYPm6yrpGQyf0Ow3AG6io7hNneSZ6Bb606bLOZpokr0Ac
QEROglQ5RfPoUuZ6YHkGI1Xxse5ypjFpyZddXU75RxXMNALJL7inRtY2LqEI5OiD
Mh/82qZ5iSc2a2JT0ZoSB4TmdwKBgQDMwrRphm7c2MhfKAZwMwMLj8IF33ZxXnoF
XWt0KnPS6O3JQnwLlxZbBkm+q7mrf61UlNNoMLqCGT6BXnhJCYUFdERL6SkZubty
0mKcGLEIGoDNcPtWDMS4plRrvrXnBknfT1rJzuPwQdfB3ovZqn9DcTlYBbGp79mK
iLzedADP/QKBgGrgDuDYXh8oq9gSS2BhP1qqxioWAQ3YtBss/flWuvTTIo7h5O2J
svj9Z/NuVQxz2Vykcr5nXAniLyUXb9c6bs/a0opxf60cjEcdauzBIs0p18C1Cqm0
zPZoL877x1tivQY7gwHGjc7fdx0qPB1ZnYdc67FV2hXEk2cft3qJEIu5AoGBAIFj
g+eu2H1by3o965uY0JLMu9lENS88eTTMrKssbHBZWnE0Pvh/99N7LLx8/W2+14O8
K78KE8FEPHg5fx8AEfu5VbL2Wk90S1wqT7+95phtTvkDLP9aQDFCgdQ4BfA/zAx9
s6wUvXrD0JgkjhD0qUiv0oGpz3PIKZpd/6M+gIjtAoGAIovCR6R6HC7RzjGw6MJI
qwkd/O29ed2NymYvVB24y7165U2nZtM06jq025U62eYx8K2ZQT4bAFk5uTbGOBEJ
X0WJ0ygoFlURfZJWiWo+CFJXPxtqtH4BdrWdM5ROGjUjbozT6ooNhbIkbaXL00uS
IwnT+f0107tneLUaL5GnK+U=
-----END PRIVATE KEY-----
```
**⚠️ Copy the ENTIRE key including BEGIN and END lines!**

### 5. Production Mode
```bash
APP_ENV=production
```

### 6. Test Number Whitelist
```bash
ALLOW_NON_DRC_TEST_NUMBERS=true
TEST_NUMBER_WHITELIST=+27603960790,+27695446706
```

### 7. Transaction Limits (USD)
```bash
BCC_TOTAL_DEBIT_CAP_USD=2500
DEFAULT_PAYOUT_CAP_USD=2500
```

### 8. PawaPay Correspondent Limits (DRC MTN)
```bash
PAWAPAY_CORRESPONDENT_LIMITS_JSON={"MTN_MOMO_COD":{"total_debit_cap_usd":2500,"payout_cap_usd":2500,"mno_fee_rate":0.015}}
```

---

## ✅ CHECKLIST

After adding all variables, verify:

- [ ] PAWAPAY_BASE_URL = https://api.pawapay.io (LIVE, not sandbox)
- [ ] PAWAPAY_API_TOKEN = Your live token from Step 2
- [ ] PAWAPAY_CORRESPONDENT = MTN_MOMO_COD
- [ ] PAWAPAY_WEBHOOK_PRIVATE_KEY = Full private key with BEGIN/END
- [ ] APP_ENV = production
- [ ] ALLOW_NON_DRC_TEST_NUMBERS = true
- [ ] TEST_NUMBER_WHITELIST = +27603960790,+27695446706
- [ ] BCC_TOTAL_DEBIT_CAP_USD = 2500
- [ ] DEFAULT_PAYOUT_CAP_USD = 2500
- [ ] PAWAPAY_CORRESPONDENT_LIMITS_JSON = (full JSON string)

---

## 🔒 SECURITY NOTES

1. **Never commit these values to Git**
2. **Private key is SECRET** - only in Supabase
3. **API token is LIVE** - real money transactions
4. **Test numbers are whitelisted** - sandbox mode only for them

---

**Once all variables are added in Supabase, tell me and we'll proceed to Step 5!**
