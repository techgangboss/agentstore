-- Atomic version creation to prevent race conditions
-- Migration: atomic_version_creation

-- Drop existing functions if they have different signatures
DROP FUNCTION IF EXISTS increment_download_count(uuid);
DROP FUNCTION IF EXISTS create_agent_version(uuid, text, jsonb, text);

-- Function to atomically create a new agent version
-- Uses row-level locking to prevent concurrent version number conflicts
CREATE OR REPLACE FUNCTION create_agent_version(
  p_agent_uuid UUID,
  p_version TEXT,
  p_manifest JSONB,
  p_changelog TEXT DEFAULT NULL
) RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  version_id UUID,
  version_number TEXT
) AS $$
DECLARE
  v_existing_version TEXT;
  v_new_version_id UUID;
BEGIN
  -- Lock the agent row to prevent concurrent modifications
  PERFORM id FROM agents WHERE id = p_agent_uuid FOR UPDATE;

  -- Check if version already exists for this agent
  SELECT version INTO v_existing_version
  FROM agent_versions
  WHERE agent_id = p_agent_uuid AND version = p_version;

  IF v_existing_version IS NOT NULL THEN
    RETURN QUERY SELECT
      false,
      format('Version %s already exists', p_version)::TEXT,
      NULL::UUID,
      NULL::TEXT;
    RETURN;
  END IF;

  -- Insert new version
  INSERT INTO agent_versions (agent_id, version, manifest, changelog)
  VALUES (p_agent_uuid, p_version, p_manifest, p_changelog)
  RETURNING id INTO v_new_version_id;

  -- Update agent's current version
  UPDATE agents
  SET version = p_version, manifest = p_manifest, updated_at = NOW()
  WHERE id = p_agent_uuid;

  RETURN QUERY SELECT
    true,
    NULL::TEXT,
    v_new_version_id,
    p_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_agent_version TO service_role;

-- Function to increment download count atomically
CREATE OR REPLACE FUNCTION increment_download_count(
  agent_uuid UUID
) RETURNS INTEGER AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE agents
  SET download_count = download_count + 1
  WHERE id = agent_uuid
  RETURNING download_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_download_count TO service_role;

-- Add unique constraint on agent_id + version if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_versions_agent_id_version_key'
  ) THEN
    -- Constraint already exists from initial schema, but just in case
    ALTER TABLE agent_versions
    ADD CONSTRAINT agent_versions_agent_id_version_unique
    UNIQUE (agent_id, version);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists, ignore
    NULL;
END $$;
