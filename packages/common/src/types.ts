// @agentstore/common - Shared type definitions

export interface Publisher {
  id: string;
  publisher_id: string;
  display_name: string;
  support_url: string | null;
  payout_address: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  agent_id: string;
  publisher_id: string;
  name: string;
  type: 'open' | 'proprietary';
  description: string;
  version: string;
  manifest: AgentManifestJson;
  is_published: boolean;
  is_featured: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentManifestJson {
  pricing: {
    model: 'free' | 'one_time' | 'subscription' | 'usage_based';
    currency: 'USD' | 'USDC';
    amount: number;
    amount_usd?: number;
  };
  install: {
    agent_wrapper: {
      format: 'markdown';
      entrypoint: string;
      content?: string;
      checksum?: string;
    };
    gateway_routes: Array<{
      route_id: string;
      mcp_endpoint: string;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: {
          type: 'object';
          properties?: Record<string, unknown>;
          required?: string[];
        };
      }>;
      auth: {
        type: 'none' | 'entitlement' | 'api_key';
      };
    }>;
  };
  permissions: {
    requires_network: boolean;
    requires_filesystem: boolean;
    notes?: string;
  };
  tags: string[];
}

export interface Entitlement {
  id: string;
  agent_id: string;
  wallet_address: string;
  entitlement_token: string;
  pricing_model: string;
  amount_paid: number;
  currency: string;
  expires_at: string | null;
  is_active: boolean;
  confirmation_status: 'preconfirmed' | 'confirmed' | 'failed';
  verification_deadline: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  entitlement_id: string;
  tx_hash: string;
  from_address: string;
  to_address: string;
  amount: number;
  currency: string;
  platform_fee: number;
  publisher_amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  block_number: number | null;
  confirmations: number;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Agent listing response
export interface AgentListItem {
  agent_id: string;
  name: string;
  type: 'open' | 'proprietary';
  description: string;
  version: string;
  publisher: {
    publisher_id: string;
    display_name: string;
  } | null;
  pricing: {
    model: string;
    amount?: number;
  };
  tags: string[];
  download_count: number;
  is_featured: boolean;
  updated_at: string;
}

// Purchase response
export interface PurchaseResponse {
  success: boolean;
  entitlement_token: string;
  expires_at: string | null;
  confirmation_status: 'preconfirmed' | 'confirmed';
  proof: {
    tx_hash: string;
    amount: string;
    currency: 'USDC';
    status: 'pending' | 'preconfirmed' | 'confirmed';
    confirmations: number;
  };
  install: AgentManifestJson['install'] | null;
}
