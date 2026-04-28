CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  status VARCHAR(50) NOT NULL CHECK (
    status IN (
      'INITIATED',
      'PENDING_FUNDING',
      'SECURED',
      'COMPLETED',
      'CANCELLED',
      'PIN_FAILED_LOCKED',
      'PAYOUT_FAILED',
      'PAYOUT_DELAYED'
    )
  ),

  seller_phone VARCHAR(20) NOT NULL REFERENCES public.users(phone_number) ON DELETE RESTRICT,
  buyer_phone VARCHAR(20) NOT NULL REFERENCES public.users(phone_number) ON DELETE RESTRICT,
  initiator_phone VARCHAR(20) NOT NULL REFERENCES public.users(phone_number) ON DELETE RESTRICT,

  item_description TEXT NOT NULL CHECK (LENGTH(item_description) <= 200),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  base_amount DECIMAL(10,2) NOT NULL CHECK (base_amount >= 1.00 AND base_amount <= 2500.00),
  mno_fee DECIMAL(10,2) NOT NULL CHECK (mno_fee >= 0),
  clairtus_fee DECIMAL(10,2) NOT NULL CHECK (clairtus_fee >= 0),

  secret_pin VARCHAR(4) CHECK (secret_pin ~ '^[0-9]{4}$'),
  pin_attempts INTEGER NOT NULL DEFAULT 0 CHECK (pin_attempts >= 0 AND pin_attempts <= 3),

  pawapay_deposit_id VARCHAR(100) UNIQUE,
  pawapay_payout_id VARCHAR(100) UNIQUE,
  pawapay_refund_id VARCHAR(100) UNIQUE,

  requires_human BOOLEAN NOT NULL DEFAULT FALSE,

  CHECK (seller_phone <> buyer_phone),
  CHECK (initiator_phone IN (seller_phone, buyer_phone))
);
