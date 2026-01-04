-- Performance optimization indexes
-- Migration: add_performance_indexes

-- Index for sorting agents by download count (most popular first)
CREATE INDEX IF NOT EXISTS idx_agents_download_count ON agents(download_count DESC);

-- Index for sorting agents by creation date
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC);

-- Index for sorting agents by update date
CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC);

-- Composite index for featured agents sorting
CREATE INDEX IF NOT EXISTS idx_agents_featured_downloads ON agents(is_featured DESC, download_count DESC)
  WHERE is_published = true;

-- Index for entitlements lookup by wallet (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_entitlements_wallet_lower ON entitlements(lower(wallet_address));

-- Index for active entitlements check
CREATE INDEX IF NOT EXISTS idx_entitlements_active ON entitlements(agent_id, wallet_address, is_active)
  WHERE is_active = true;

-- Index for transaction lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON transactions(lower(from_address));

-- Index for pending transactions (for cron job verification)
CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions(status, created_at)
  WHERE status = 'pending';

-- Partial index for published agents (most common query)
CREATE INDEX IF NOT EXISTS idx_agents_published ON agents(agent_id)
  WHERE is_published = true;

-- Add confirmation_status and verification_deadline columns to entitlements (for preconfirmation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entitlements' AND column_name = 'confirmation_status'
  ) THEN
    ALTER TABLE entitlements ADD COLUMN confirmation_status TEXT DEFAULT 'confirmed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entitlements' AND column_name = 'verification_deadline'
  ) THEN
    ALTER TABLE entitlements ADD COLUMN verification_deadline TIMESTAMPTZ;
  END IF;
END $$;

-- Index for preconfirmed entitlements pending verification
CREATE INDEX IF NOT EXISTS idx_entitlements_pending_verification
  ON entitlements(verification_deadline)
  WHERE confirmation_status = 'preconfirmed' AND verification_deadline IS NOT NULL;

-- Add block_number and confirmations columns to transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE transactions ADD COLUMN block_number BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'confirmations'
  ) THEN
    ALTER TABLE transactions ADD COLUMN confirmations INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add atomic purchase function to prevent race conditions
CREATE OR REPLACE FUNCTION atomic_purchase(
  p_agent_id UUID,
  p_wallet_address TEXT,
  p_expected_price DECIMAL,
  p_tx_hash TEXT
) RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  agent_price DECIMAL
) AS $$
DECLARE
  v_agent agents%ROWTYPE;
  v_current_price DECIMAL;
BEGIN
  -- Lock the agent row to prevent concurrent modifications
  SELECT * INTO v_agent
  FROM agents
  WHERE id = p_agent_id AND is_published = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Agent not found or not published'::TEXT, NULL::DECIMAL;
    RETURN;
  END IF;

  -- Extract price from manifest
  v_current_price := COALESCE(
    (v_agent.manifest->'pricing'->>'amount_usd')::DECIMAL,
    (v_agent.manifest->'pricing'->>'amount')::DECIMAL,
    0
  );

  -- Check if price changed (with 5% tolerance for ETH volatility)
  IF v_current_price > p_expected_price * 1.05 THEN
    RETURN QUERY SELECT false, 'Agent price has increased'::TEXT, v_current_price;
    RETURN;
  END IF;

  -- Check for existing entitlement
  IF EXISTS (
    SELECT 1 FROM entitlements
    WHERE agent_id = p_agent_id
    AND lower(wallet_address) = lower(p_wallet_address)
    AND is_active = true
  ) THEN
    RETURN QUERY SELECT false, 'Already purchased'::TEXT, v_current_price;
    RETURN;
  END IF;

  -- Check for transaction replay
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE lower(tx_hash) = lower(p_tx_hash)
  ) THEN
    RETURN QUERY SELECT false, 'Transaction already used'::TEXT, v_current_price;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, v_current_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION atomic_purchase TO service_role;
