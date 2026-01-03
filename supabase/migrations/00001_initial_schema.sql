-- AgentStore Database Schema
-- Initial migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Publishers table
CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  publisher_id TEXT UNIQUE NOT NULL, -- e.g., "acme-corp"
  display_name TEXT NOT NULL,
  support_url TEXT,
  payout_address TEXT NOT NULL, -- Ethereum address for payments
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT UNIQUE NOT NULL, -- e.g., "acme-corp.research.analyst"
  publisher_id UUID REFERENCES publishers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('open', 'proprietary')),
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest JSONB NOT NULL, -- Full agent manifest
  is_published BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent versions (for history)
CREATE TABLE agent_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  changelog TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, version)
);

-- Entitlements (purchase records)
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL, -- Buyer's wallet address
  entitlement_token TEXT UNIQUE NOT NULL, -- JWT or API key
  pricing_model TEXT NOT NULL,
  amount_paid DECIMAL(18, 6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  expires_at TIMESTAMPTZ, -- NULL for lifetime
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (payment history)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entitlement_id UUID REFERENCES entitlements(id),
  tx_hash TEXT UNIQUE NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL, -- Publisher payout address
  amount DECIMAL(18, 6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  platform_fee DECIMAL(18, 6) NOT NULL, -- 10% fee
  publisher_amount DECIMAL(18, 6) NOT NULL, -- 90% to publisher
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories/tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE agent_tags (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, tag_id)
);

-- Indexes for search and filtering
CREATE INDEX idx_agents_publisher ON agents(publisher_id);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_published ON agents(is_published);
CREATE INDEX idx_agents_name ON agents USING gin(to_tsvector('english', name || ' ' || description));
CREATE INDEX idx_entitlements_wallet ON entitlements(wallet_address);
CREATE INDEX idx_entitlements_agent ON entitlements(agent_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_publishers_updated_at
  BEFORE UPDATE ON publishers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Initial tags
INSERT INTO tags (name, slug) VALUES
  ('Research', 'research'),
  ('Trading', 'trading'),
  ('Development', 'development'),
  ('Automation', 'automation'),
  ('AI/ML', 'ai-ml'),
  ('Data', 'data'),
  ('Security', 'security'),
  ('Productivity', 'productivity');
