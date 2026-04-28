CREATE TABLE IF NOT EXISTS public.transaction_status_log (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  event VARCHAR(100),
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM'
);

CREATE TABLE IF NOT EXISTS public.messages_log (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(20) NOT NULL CHECK (recipient_phone ~ '^\+243[0-9]{9}$'),
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by VARCHAR(100) NOT NULL,
  whatsapp_message_id VARCHAR(100),
  delivery_status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS public.error_logs (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);
