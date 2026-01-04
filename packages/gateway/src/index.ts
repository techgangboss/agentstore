import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Validated base directory - prevent path traversal
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const AGENTSTORE_DIR = path.resolve(path.join(HOME_DIR, '.agentstore'));

// Ensure paths stay within AGENTSTORE_DIR
function safePath(filePath: string): string {
  const resolved = path.resolve(AGENTSTORE_DIR, filePath);
  if (!resolved.startsWith(AGENTSTORE_DIR)) {
    throw new Error(`Path traversal attempt detected: ${filePath}`);
  }
  return resolved;
}

const ROUTES_FILE = safePath('routes.json');
const ENTITLEMENTS_FILE = safePath('entitlements.json');

// Zod schemas for config validation
const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(1000),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  }),
});

const GatewayRouteSchema = z.object({
  agentId: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  routeId: z.string().min(1).max(100),
  mcpEndpoint: z.string().url(),
  tools: z.array(ToolDefinitionSchema),
  authType: z.enum(['none', 'entitlement', 'api_key']),
});

const EntitlementSchema = z.object({
  agentId: z.string().min(1).max(100),
  token: z.string().min(1),
  expiresAt: z.string().nullable(),
});

const RoutesConfigSchema = z.array(GatewayRouteSchema);
const EntitlementsConfigSchema = z.array(EntitlementSchema);

type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
type GatewayRoute = z.infer<typeof GatewayRouteSchema>;
type Entitlement = z.infer<typeof EntitlementSchema>;

class AgentStoreGateway {
  private routes: Map<string, GatewayRoute> = new Map();
  private toolDefinitions: Map<string, { route: GatewayRoute; tool: ToolDefinition }> = new Map();
  private entitlements: Map<string, Entitlement> = new Map();

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    // Load routes and tool definitions with validation
    if (fs.existsSync(ROUTES_FILE)) {
      try {
        const rawData = fs.readFileSync(ROUTES_FILE, 'utf-8');
        const parsed = JSON.parse(rawData);
        const validationResult = RoutesConfigSchema.safeParse(parsed);

        if (!validationResult.success) {
          console.error('Routes config validation failed:', validationResult.error.format());
          throw new Error(`Invalid routes configuration: ${validationResult.error.message}`);
        }

        const routes = validationResult.data;
        for (const route of routes) {
          // Additional URL validation - only allow HTTPS in production
          if (process.env.NODE_ENV === 'production' && !route.mcpEndpoint.startsWith('https://')) {
            console.warn(`Skipping route ${route.agentId}: HTTPS required in production`);
            continue;
          }

          this.routes.set(route.agentId, route);
          // Register each tool with its full definition
          for (const tool of route.tools) {
            const prefixedName = `${route.agentId}:${tool.name}`;
            this.toolDefinitions.set(prefixedName, { route, tool });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to load routes config: ${message}`, { cause: error });
      }
    }

    // Load entitlements with validation
    if (fs.existsSync(ENTITLEMENTS_FILE)) {
      try {
        const rawData = fs.readFileSync(ENTITLEMENTS_FILE, 'utf-8');
        const parsed = JSON.parse(rawData);
        const validationResult = EntitlementsConfigSchema.safeParse(parsed);

        if (!validationResult.success) {
          console.error('Entitlements config validation failed:', validationResult.error.format());
          throw new Error(`Invalid entitlements configuration: ${validationResult.error.message}`);
        }

        for (const ent of validationResult.data) {
          this.entitlements.set(ent.agentId, ent);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to load entitlements config: ${message}`, { cause: error });
      }
    }
  }

  // Reload config (useful when new agents are installed)
  reloadConfig(): void {
    this.routes.clear();
    this.toolDefinitions.clear();
    this.entitlements.clear();
    this.loadConfig();
  }

  getRouteForTool(toolName: string): GatewayRoute | undefined {
    const entry = this.toolDefinitions.get(toolName);
    return entry?.route;
  }

  // Get all registered tools for ListTools
  getAllTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];

    for (const [prefixedName, { tool }] of this.toolDefinitions) {
      tools.push({
        name: prefixedName,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }

    return tools;
  }

  getEntitlement(agentId: string): Entitlement | undefined {
    const ent = this.entitlements.get(agentId);
    if (ent && ent.expiresAt && new Date(ent.expiresAt) < new Date()) {
      return undefined; // Expired
    }
    return ent;
  }

  async proxyToolCall(
    route: GatewayRoute,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization based on auth type
    if (route.authType === 'entitlement') {
      const ent = this.getEntitlement(route.agentId);
      if (!ent) {
        throw new Error(`No valid entitlement for agent ${route.agentId}. Please purchase or renew access.`);
      }
      headers['Authorization'] = `Bearer ${ent.token}`;
    }

    // Validate endpoint URL before making request
    const endpointUrl = new URL(route.mcpEndpoint);
    if (process.env.NODE_ENV === 'production' && endpointUrl.protocol !== 'https:') {
      throw new Error(`Insecure endpoint rejected: ${route.mcpEndpoint}. HTTPS required.`);
    }

    try {
      // Make request to publisher's MCP endpoint with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(route.mcpEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: toolName.split(':')[1], // Remove agent prefix
            arguments: args,
          },
          id: Date.now(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No response body');
        throw new Error(
          `MCP call failed: ${response.status} ${response.statusText}. ` +
          `Endpoint: ${route.mcpEndpoint}. Details: ${errorBody.slice(0, 200)}`
        );
      }

      const result = (await response.json()) as { result?: unknown; error?: { message?: string } };

      if (result.error) {
        throw new Error(`MCP endpoint error: ${result.error.message || 'Unknown error'}`);
      }

      return result.result;
    } catch (error) {
      // Preserve error context
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutErr = new Error(`Request to ${route.mcpEndpoint} timed out after 30s`);
          timeoutErr.cause = error;
          throw timeoutErr;
        }
        const wrappedErr = new Error(`Failed to call ${toolName} on ${route.agentId}: ${error.message}`);
        wrappedErr.cause = error;
        throw wrappedErr;
      }
      throw new Error(`Unexpected error calling ${toolName}: ${String(error)}`);
    }
  }
}

async function main() {
  const gateway = new AgentStoreGateway();

  const server = new Server(
    {
      name: 'agentstore-gateway',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools from installed agents
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Reload config to pick up newly installed agents
    gateway.reloadConfig();
    const tools = gateway.getAllTools();
    return { tools };
  });

  // Handle tool calls by routing to appropriate publisher MCP
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const route = gateway.getRouteForTool(name);
    if (!route) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const result = await gateway.proxyToolCall(route, name, args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentStore Gateway MCP server running on stdio');
}

main().catch(console.error);
