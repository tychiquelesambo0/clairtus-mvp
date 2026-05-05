-- Migration: Create processed_webhooks table for webhook idempotency
-- Date: 2026-05-05
-- Purpose: Prevent duplicate webhook processing (double-crediting, etc.)

-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id VARCHAR(255) NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id, event_type)
);

-- Indexes for fast lookup
CREATE INDEX idx_processed_webhooks_lookup 
ON public.processed_webhooks(webhook_id, event_type);

CREATE INDEX idx_processed_webhooks_transaction 
ON public.processed_webhooks(transaction_id);

CREATE INDEX idx_processed_webhooks_processed_at 
ON public.processed_webhooks(processed_at);

-- Add comment for documentation
COMMENT ON TABLE public.processed_webhooks IS 
'Tracks processed webhook events to prevent duplicate processing and ensure idempotency';

COMMENT ON COLUMN public.processed_webhooks.webhook_id IS 
'Unique identifier from the webhook provider (PawaPay depositId, payoutId, refundId, etc.)';

COMMENT ON COLUMN public.processed_webhooks.event_type IS 
'Type of webhook event (DEPOSIT, PAYOUT, REFUND, etc.)';
