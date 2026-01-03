import { z } from 'zod';

// Agent manifest schema based on the product spec
export const PricingSchema = z.object({
  model: z.enum(['free', 'one_time', 'per_call']),
  currency: z.literal('USDC').optional(),
  amount: z.number().min(0),
  billing: z.enum(['one_time', 'per_call']).optional(),
});

export const AuthSchema = z.object({
  type: z.enum(['none', 'api_key', 'oauth', 'entitlement']),
});

export const GatewayRouteSchema = z.object({
  route_id: z.string(),
  mcp_endpoint: z.string().url(),
  tools: z.array(z.string()),
  auth: AuthSchema,
});

export const AgentWrapperSchema = z.object({
  format: z.enum(['markdown']),
  entrypoint: z.string(),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const InstallSchema = z.object({
  agent_wrapper: AgentWrapperSchema,
  gateway_routes: z.array(GatewayRouteSchema),
});

export const PublisherSchema = z.object({
  publisher_id: z.string(),
  display_name: z.string(),
  support_url: z.string().url().optional(),
});

export const PermissionsSchema = z.object({
  requires_network: z.boolean(),
  requires_filesystem: z.boolean(),
  notes: z.string().optional(),
});

export const AgentManifestSchema = z.object({
  agent_id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  type: z.enum(['open', 'proprietary']),
  description: z.string().min(10).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  publisher: PublisherSchema,
  pricing: PricingSchema,
  install: InstallSchema,
  permissions: PermissionsSchema,
  tags: z.array(z.string()).max(10),
  updated_at: z.string().datetime(),
});

// Validation rules
export const validateManifest = (manifest: unknown) => {
  const result = AgentManifestSchema.safeParse(manifest);

  if (!result.success) {
    return { valid: false, errors: result.error.errors };
  }

  const data = result.data;

  // Additional business rules
  const errors: string[] = [];

  // Open agents must be free with no auth
  if (data.type === 'open') {
    if (data.pricing.model !== 'free' || data.pricing.amount !== 0) {
      errors.push('Open agents must have pricing.model=free and pricing.amount=0');
    }
    if (data.install.gateway_routes.some(r => r.auth.type !== 'none')) {
      errors.push('Open agents must have auth.type=none for all routes');
    }
  }

  // Proprietary agents must have entitlement auth
  if (data.type === 'proprietary') {
    if (!data.install.gateway_routes.some(r => r.auth.type === 'entitlement')) {
      errors.push('Proprietary agents must have at least one route with auth.type=entitlement');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data };
};

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type Pricing = z.infer<typeof PricingSchema>;
export type Publisher = z.infer<typeof PublisherSchema>;
