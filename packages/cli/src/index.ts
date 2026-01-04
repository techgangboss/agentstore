#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = 'https://api-inky-seven.vercel.app';

// File paths
const HOME_DIR = os.homedir();
const AGENTSTORE_DIR = path.join(HOME_DIR, '.agentstore');
const ROUTES_FILE = path.join(AGENTSTORE_DIR, 'routes.json');
const ENTITLEMENTS_FILE = path.join(AGENTSTORE_DIR, 'entitlements.json');
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills', 'agentstore');

// Types
interface GatewayRoute {
  agentId: string;
  routeId: string;
  mcpEndpoint: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  authType: string;
}

interface Entitlement {
  agentId: string;
  token: string;
  expiresAt: string | null;
}

interface AgentManifest {
  agent_id: string;
  name: string;
  type: 'open' | 'proprietary';
  description: string;
  version: string;
  publisher: {
    publisher_id: string;
    display_name: string;
  };
  pricing: {
    model: string;
    amount: number;
    currency: string;
  };
  install: {
    gateway_routes: Array<{
      route_id: string;
      mcp_endpoint: string;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
      auth: {
        type: string;
      };
    }>;
  };
  permissions: {
    requires_network: boolean;
    requires_filesystem: boolean;
    notes?: string;
  };
}

// API returns flat structure (manifest fields at top level)
interface ApiAgent {
  agent_id: string;
  name: string;
  type: 'open' | 'proprietary';
  description: string;
  version: string;
  publisher: {
    publisher_id: string;
    display_name: string;
  };
  pricing: {
    model: string;
    amount: number;
    currency: string;
  };
  install: {
    gateway_routes: Array<{
      route_id: string;
      mcp_endpoint: string;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
      auth: {
        type: string;
      };
    }>;
  };
  permissions: {
    requires_network: boolean;
    requires_filesystem: boolean;
    notes?: string;
  };
}

// Ensure directories exist
function ensureDirectories(): void {
  if (!fs.existsSync(AGENTSTORE_DIR)) {
    fs.mkdirSync(AGENTSTORE_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// Load/save routes
function loadRoutes(): GatewayRoute[] {
  try {
    if (fs.existsSync(ROUTES_FILE)) {
      return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveRoutes(routes: GatewayRoute[]): void {
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), { mode: 0o600 });
}

// Load/save entitlements
function loadEntitlements(): Entitlement[] {
  try {
    if (fs.existsSync(ENTITLEMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(ENTITLEMENTS_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveEntitlements(entitlements: Entitlement[]): void {
  fs.writeFileSync(ENTITLEMENTS_FILE, JSON.stringify(entitlements, null, 2), { mode: 0o600 });
}

// Fetch agent from API
async function fetchAgent(agentId: string): Promise<ApiAgent | null> {
  try {
    const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.error(`Agent not found: ${agentId}`);
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }
    return (await response.json()) as ApiAgent;
  } catch (error) {
    console.error(`Failed to fetch agent: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// Create skill file for Claude
function createSkillFile(agent: ApiAgent): void {
  // API returns flat structure - agent IS the manifest
  const tools = agent.install.gateway_routes.flatMap((r) =>
    r.tools.map((t) => `- \`${agent.agent_id}:${t.name}\` - ${t.description}`)
  );

  const content = `---
description: ${agent.description}
---

# ${agent.name}

**Publisher:** ${agent.publisher.display_name}
**Version:** ${agent.version}
**Type:** ${agent.type === 'open' ? 'Free' : 'Paid'}

${agent.description}

## Available Tools

${tools.join('\n')}

## Usage

These tools are available via the AgentStore gateway. Simply ask Claude to use them by name.

Example: "Use ${agent.agent_id}:${agent.install.gateway_routes[0]?.tools[0]?.name || 'tool_name'} to..."
`;

  const skillFile = path.join(SKILLS_DIR, `${agent.agent_id.replace(/\./g, '-')}.md`);
  fs.writeFileSync(skillFile, content);
  console.log(`  Created skill file: ${skillFile}`);
}

// Install command
async function installAgent(agentId: string, options: { yes?: boolean }): Promise<void> {
  ensureDirectories();

  console.log(`Fetching agent: ${agentId}...`);
  const agent = await fetchAgent(agentId);

  if (!agent) {
    process.exit(1);
  }

  // API returns flat structure - agent IS the manifest

  // Check if already installed
  const routes = loadRoutes();
  const existingRoute = routes.find((r) => r.agentId === agent.agent_id);
  if (existingRoute) {
    console.log(`Agent ${agent.agent_id} is already installed.`);
    console.log('Use --yes to reinstall/update.');
    if (!options.yes) {
      process.exit(0);
    }
  }

  // Display agent info
  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log(`│ Installing: ${agent.name} v${agent.version}`.padEnd(50) + '│');
  console.log('├─────────────────────────────────────────────────┤');
  console.log(`│ Publisher: ${agent.publisher.display_name}`.padEnd(50) + '│');
  console.log(`│ Type: ${agent.type === 'open' ? 'Free (Open Source)' : 'Paid (Proprietary)'}`.padEnd(50) + '│');
  console.log(`│ Price: ${agent.pricing.model === 'free' ? 'FREE' : `$${agent.pricing.amount}`}`.padEnd(50) + '│');
  console.log('├─────────────────────────────────────────────────┤');
  console.log('│ Tools:'.padEnd(50) + '│');
  for (const route of agent.install.gateway_routes) {
    for (const tool of route.tools) {
      const toolLine = `│   • ${tool.name}`;
      console.log(toolLine.padEnd(50) + '│');
    }
  }
  console.log('└─────────────────────────────────────────────────┘');

  // For paid agents, we'd need wallet integration here
  if (agent.type === 'proprietary' && agent.pricing.model !== 'free') {
    console.log('\n⚠️  This is a paid agent.');
    console.log('   Payment flow not yet implemented in CLI.');
    console.log('   Use the full plugin flow for paid agents.');
    process.exit(1);
  }

  console.log('\nInstalling...');

  // Remove existing route if updating
  const updatedRoutes = routes.filter((r) => r.agentId !== agent.agent_id);

  // Add new routes
  for (const gatewayRoute of agent.install.gateway_routes) {
    const route: GatewayRoute = {
      agentId: agent.agent_id,
      routeId: gatewayRoute.route_id,
      mcpEndpoint: gatewayRoute.mcp_endpoint,
      tools: gatewayRoute.tools,
      authType: gatewayRoute.auth.type,
    };
    updatedRoutes.push(route);
  }

  saveRoutes(updatedRoutes);
  console.log(`  ✓ Added ${agent.install.gateway_routes.length} route(s) to ${ROUTES_FILE}`);

  // Create skill file
  createSkillFile(agent);

  // Count tools
  const toolCount = agent.install.gateway_routes.reduce((sum, r) => sum + r.tools.length, 0);

  console.log('\n✅ Installation complete!');
  console.log(`\n   Agent: ${agent.agent_id}`);
  console.log(`   Tools: ${toolCount} available`);
  console.log('\n   To use, ask Claude to call the tools, e.g.:');
  const firstTool = agent.install.gateway_routes[0]?.tools[0];
  if (firstTool) {
    console.log(`   "Use ${agent.agent_id}:${firstTool.name}"`);
  }
}

// List installed agents
function listAgents(): void {
  const routes = loadRoutes();

  if (routes.length === 0) {
    console.log('No agents installed.');
    console.log('\nRun: agentstore install <agent_id>');
    return;
  }

  // Group by agentId
  const agents = new Map<string, GatewayRoute[]>();
  for (const route of routes) {
    const existing = agents.get(route.agentId) || [];
    existing.push(route);
    agents.set(route.agentId, existing);
  }

  console.log(`\nInstalled Agents (${agents.size}):\n`);

  for (const [agentId, agentRoutes] of agents) {
    const toolCount = agentRoutes.reduce((sum, r) => sum + r.tools.length, 0);
    const authType = agentRoutes[0]?.authType || 'none';

    console.log(`  ${agentId}`);
    console.log(`    Tools: ${toolCount}`);
    console.log(`    Auth: ${authType}`);

    for (const route of agentRoutes) {
      for (const tool of route.tools) {
        console.log(`      • ${agentId}:${tool.name}`);
      }
    }
    console.log();
  }
}

// Uninstall agent
function uninstallAgent(agentId: string): void {
  const routes = loadRoutes();
  const entitlements = loadEntitlements();

  const routesBefore = routes.length;
  const updatedRoutes = routes.filter((r) => r.agentId !== agentId);

  if (updatedRoutes.length === routesBefore) {
    console.log(`Agent not found: ${agentId}`);
    process.exit(1);
  }

  saveRoutes(updatedRoutes);
  console.log(`  ✓ Removed routes from ${ROUTES_FILE}`);

  // Remove entitlement if exists
  const updatedEntitlements = entitlements.filter((e) => e.agentId !== agentId);
  if (updatedEntitlements.length < entitlements.length) {
    saveEntitlements(updatedEntitlements);
    console.log(`  ✓ Removed entitlement from ${ENTITLEMENTS_FILE}`);
  }

  // Remove skill file
  const skillFile = path.join(SKILLS_DIR, `${agentId.replace(/\./g, '-')}.md`);
  if (fs.existsSync(skillFile)) {
    fs.unlinkSync(skillFile);
    console.log(`  ✓ Removed skill file: ${skillFile}`);
  }

  console.log(`\n✅ Uninstalled: ${agentId}`);
}

// Show config info
function showConfig(): void {
  console.log('\nAgentStore Configuration:\n');
  console.log(`  Config directory: ${AGENTSTORE_DIR}`);
  console.log(`  Routes file: ${ROUTES_FILE}`);
  console.log(`  Entitlements file: ${ENTITLEMENTS_FILE}`);
  console.log(`  Skills directory: ${SKILLS_DIR}`);

  const routes = loadRoutes();
  const entitlements = loadEntitlements();

  console.log(`\n  Installed agents: ${new Set(routes.map((r) => r.agentId)).size}`);
  console.log(`  Total routes: ${routes.length}`);
  console.log(`  Entitlements: ${entitlements.length}`);

  // Check if gateway is configured
  const mcpConfigFile = path.join(CLAUDE_DIR, 'mcp.json');
  if (fs.existsSync(mcpConfigFile)) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf-8'));
      const hasGateway = mcpConfig.mcpServers?.['agentstore-gateway'];
      console.log(`\n  Gateway configured: ${hasGateway ? '✓ Yes' : '✗ No'}`);
    } catch {
      console.log('\n  Gateway configured: ? (could not read mcp.json)');
    }
  } else {
    console.log('\n  Gateway configured: ✗ No (mcp.json not found)');
  }
}

// Setup gateway in Claude's MCP config
function setupGateway(): void {
  const mcpConfigFile = path.join(CLAUDE_DIR, 'mcp.json');

  let mcpConfig: Record<string, unknown> = { mcpServers: {} };

  if (fs.existsSync(mcpConfigFile)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf-8'));
    } catch {
      console.log('Warning: Could not parse existing mcp.json, creating new one');
    }
  }

  if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
    mcpConfig.mcpServers = {};
  }

  const servers = mcpConfig.mcpServers as Record<string, unknown>;

  // Check if already configured
  if (servers['agentstore-gateway']) {
    console.log('Gateway already configured in mcp.json');
    return;
  }

  // Find the gateway executable
  // In production this would be installed globally, for now use local path
  const gatewayPath = path.join(process.cwd(), 'packages', 'gateway', 'dist', 'index.js');

  servers['agentstore-gateway'] = {
    command: 'node',
    args: [gatewayPath],
  };

  // Ensure .claude directory exists
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpConfig, null, 2));
  console.log(`✓ Added agentstore-gateway to ${mcpConfigFile}`);
  console.log('\nRestart Claude Code to activate the gateway.');
}

// Main CLI
const program = new Command();

program
  .name('agentstore')
  .description('AgentStore CLI - Install and manage marketplace agents')
  .version('1.0.0');

program
  .command('install <agent_id>')
  .description('Install an agent from the marketplace')
  .option('-y, --yes', 'Skip confirmation / force reinstall')
  .action(installAgent);

program
  .command('list')
  .alias('ls')
  .description('List installed agents')
  .action(listAgents);

program
  .command('uninstall <agent_id>')
  .alias('rm')
  .description('Uninstall an agent')
  .action(uninstallAgent);

program
  .command('config')
  .description('Show configuration info')
  .action(showConfig);

program
  .command('gateway-setup')
  .description('Configure gateway in Claude MCP settings')
  .action(setupGateway);

program.parse();
