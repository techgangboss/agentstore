-- Add Row Level Security policies
-- Migration: add_rls_policies

-- Enable Row Level Security on all tables
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tags ENABLE ROW LEVEL SECURITY;

-- PUBLISHERS: Public read, authenticated write for own records
CREATE POLICY "Public read publishers"
  ON publishers FOR SELECT
  USING (true);

-- AGENTS: Public read for published, service role for writes
CREATE POLICY "Public read published agents"
  ON agents FOR SELECT
  USING (is_published = true);

CREATE POLICY "Service role full access to agents"
  ON agents FOR ALL
  USING (auth.role() = 'service_role');

-- AGENT_VERSIONS: Public read, service role for writes
CREATE POLICY "Public read agent versions"
  ON agent_versions FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to agent_versions"
  ON agent_versions FOR ALL
  USING (auth.role() = 'service_role');

-- ENTITLEMENTS: Service role only (sensitive payment data)
CREATE POLICY "Service role full access to entitlements"
  ON entitlements FOR ALL
  USING (auth.role() = 'service_role');

-- TRANSACTIONS: Service role only (sensitive payment data)
CREATE POLICY "Service role full access to transactions"
  ON transactions FOR ALL
  USING (auth.role() = 'service_role');

-- TAGS: Public read, service role for writes
CREATE POLICY "Public read tags"
  ON tags FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to tags"
  ON tags FOR ALL
  USING (auth.role() = 'service_role');

-- AGENT_TAGS: Public read, service role for writes
CREATE POLICY "Public read agent_tags"
  ON agent_tags FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to agent_tags"
  ON agent_tags FOR ALL
  USING (auth.role() = 'service_role');

-- Create atomic increment function for download counts
-- SET search_path to prevent search_path injection attacks
CREATE OR REPLACE FUNCTION increment_download_count(agent_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.agents SET download_count = download_count + 1 WHERE id = agent_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
