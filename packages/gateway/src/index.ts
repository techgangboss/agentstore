import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

const AGENTSTORE_DIR = path.join(process.env.HOME || '~', '.agentstore');
const ROUTES_FILE = path.join(AGENTSTORE_DIR, 'routes.json');
const ENTITLEMENTS_FILE = path.join(AGENTSTORE_DIR, 'entitlements.json');

interface GatewayRoute {
  agentId: string;
  routeId: string;
  mcpEndpoint: string;
  tools: string[];
  authType: 'none' | 'entitlement' | 'api_key';
}

interface Entitlement {
  agentId: string;
  token: string;
  expiresAt: string | null;
}

class AgentStoreGateway {
  private routes: Map<string, GatewayRoute> = new Map();
  private entitlements: Map<string, Entitlement> = new Map();

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    // Load routes
    if (fs.existsSync(ROUTES_FILE)) {
      const routes: GatewayRoute[] = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf-8'));
      for (const route of routes) {
        for (const tool of route.tools) {
          this.routes.set(`${route.agentId}:${tool}`, route);
        }
      }
    }

    // Load entitlements
    if (fs.existsSync(ENTITLEMENTS_FILE)) {
      const entitlements: Entitlement[] = JSON.parse(fs.readFileSync(ENTITLEMENTS_FILE, 'utf-8'));
      for (const ent of entitlements) {
        this.entitlements.set(ent.agentId, ent);
      }
    }
  }

  getRouteForTool(toolName: string): GatewayRoute | undefined {
    // Tool names are prefixed with agent ID: "agentId:toolName"
    return this.routes.get(toolName);
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
        throw new Error(`No valid entitlement for agent ${route.agentId}`);
      }
      headers['Authorization'] = `Bearer ${ent.token}`;
    }

    // Make request to publisher's MCP endpoint
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
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as { result?: unknown };
    return result.result;
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
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> = [];

    // TODO: Load tool definitions from installed agents
    // For now, return empty list

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
