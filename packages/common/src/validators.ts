import { z } from 'zod';

// Common validation patterns
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address')
  .transform((addr) => addr.toLowerCase());

export const TransactionHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a valid transaction hash')
  .transform((hash) => hash.toLowerCase());

export const AgentIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with dots/hyphens');

export const PublisherIdSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with hyphens');

export const VersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version (e.g., 1.0.0)');

export const SlugSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens');

// Pricing schemas
export const PricingModelSchema = z.enum(['free', 'one_time', 'subscription', 'usage_based']);
export const CurrencySchema = z.enum(['USD', 'ETH', 'USDC']);

export const PricingSchema = z.object({
  model: PricingModelSchema,
  currency: CurrencySchema.default('USD'),
  amount: z.number().min(0).default(0),
  amount_usd: z.number().min(0).optional(),
});

// Agent manifest schemas
export const PermissionsSchema = z.object({
  requires_network: z.boolean().default(false),
  requires_filesystem: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export const ToolInputSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.unknown()).optional(),
  required: z.array(z.string()).optional(),
});

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(1000),
  inputSchema: ToolInputSchema,
});

export const GatewayRouteSchema = z.object({
  route_id: z.string().min(1).max(100),
  mcp_endpoint: z.string().url(),
  tools: z.array(ToolDefinitionSchema),
  auth: z.object({
    type: z.enum(['none', 'entitlement', 'api_key']),
  }),
});

export const AgentWrapperSchema = z.object({
  format: z.enum(['markdown']),
  entrypoint: z.string().min(1).max(200),
  content: z.string().optional(),
  checksum: z.string().optional(),
});

export const InstallSchema = z.object({
  agent_wrapper: AgentWrapperSchema,
  gateway_routes: z.array(GatewayRouteSchema),
});

export const AgentManifestSchema = z.object({
  pricing: PricingSchema,
  install: InstallSchema,
  permissions: PermissionsSchema,
  tags: z.array(z.string().max(30)).max(5),
});

// API request schemas
export const PurchaseRequestSchema = z.object({
  agent_id: z.string(),
  wallet_address: EthereumAddressSchema,
  tx_hash: TransactionHashSchema,
});

export const RegisterPublisherRequestSchema = z.object({
  publisher_id: PublisherIdSchema,
  display_name: z.string().min(1).max(100),
  payout_address: EthereumAddressSchema,
  support_url: z.string().url().optional(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  message: z.string(),
});

export const SubmitAgentRequestSchema = z.object({
  agent_id: AgentIdSchema,
  name: z.string().min(1).max(100),
  type: z.enum(['open', 'proprietary']),
  description: z.string().min(10).max(1000),
  version: VersionSchema,
  pricing: PricingSchema,
  install: InstallSchema,
  permissions: PermissionsSchema,
  tags: z.array(z.string()).max(5),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  message: z.string(),
});

export const SearchAgentsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  tag: SlugSchema.optional(),
  type: z.enum(['open', 'proprietary']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// Pagination helper
export const PaginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// Export inferred types
export type EthereumAddress = z.infer<typeof EthereumAddressSchema>;
export type TransactionHash = z.infer<typeof TransactionHashSchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;
export type PublisherId = z.infer<typeof PublisherIdSchema>;
export type Pricing = z.infer<typeof PricingSchema>;
export type Permissions = z.infer<typeof PermissionsSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type GatewayRoute = z.infer<typeof GatewayRouteSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;
export type RegisterPublisherRequest = z.infer<typeof RegisterPublisherRequestSchema>;
export type SubmitAgentRequest = z.infer<typeof SubmitAgentRequestSchema>;
export type SearchAgentsQuery = z.infer<typeof SearchAgentsQuerySchema>;
