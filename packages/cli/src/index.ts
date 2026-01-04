#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://api-inky-seven.vercel.app';
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

// File paths
const HOME_DIR = os.homedir();
const AGENTSTORE_DIR = path.join(HOME_DIR, '.agentstore');
const ROUTES_FILE = path.join(AGENTSTORE_DIR, 'routes.json');
const ENTITLEMENTS_FILE = path.join(AGENTSTORE_DIR, 'entitlements.json');
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills', 'agentstore');
const WALLET_FILE = path.join(AGENTSTORE_DIR, 'wallet.json');

// Types
interface WalletConfig {
  address: string;
  createdAt: string;
  network: 'mainnet';
  rpcEndpoint: string;
  spendLimits: {
    perTransaction: number;
    daily: number;
    weekly: number;
  };
}
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

// Load wallet config
function loadWalletConfig(): WalletConfig | null {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

// Get ETH price from CoinGecko
async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    const data = (await response.json()) as { ethereum?: { usd?: number } };
    return data.ethereum?.usd || 2000;
  } catch {
    return 2000;
  }
}

// Prompt user for confirmation
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// Purchase agent via API
async function purchaseAgent(
  agentId: string,
  walletAddress: string,
  txHash: string
): Promise<{ entitlement_token: string; expires_at: string | null } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        wallet_address: walletAddress,
        tx_hash: txHash,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      console.error(`Purchase failed: ${error.error || response.statusText}`);
      return null;
    }

    return (await response.json()) as { entitlement_token: string; expires_at: string | null };
  } catch (error) {
    console.error(`Purchase error: ${error instanceof Error ? error.message : error}`);
    return null;
  }
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
async function installAgent(agentId: string, options: { yes?: boolean; txHash?: string }): Promise<void> {
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

  // For paid agents, handle payment flow
  let entitlementToken: string | null = null;
  let expiresAt: string | null = null;

  if (agent.type === 'proprietary' && agent.pricing.model !== 'free') {
    const wallet = loadWalletConfig();

    if (!wallet) {
      console.log('\n⚠️  This is a paid agent ($' + agent.pricing.amount + ')');
      console.log('   No wallet configured. Run the wallet package to set one up:');
      console.log('   node packages/wallet/dist/index.js');
      process.exit(1);
    }

    const ethPrice = await getEthPrice();
    const priceEth = agent.pricing.amount / ethPrice;

    console.log('\n💰 Payment Required:');
    console.log(`   Price: $${agent.pricing.amount} (~${priceEth.toFixed(6)} ETH)`);
    console.log(`   Your wallet: ${wallet.address}`);
    console.log(`   ETH Price: $${ethPrice}`);

    // Check if already purchased
    const entitlements = loadEntitlements();
    const existing = entitlements.find((e) => e.agentId === agent.agent_id);
    if (existing) {
      console.log('\n✓ Already purchased! Using existing entitlement.');
      entitlementToken = existing.token;
      expiresAt = existing.expiresAt;
    } else {
      console.log('\n⚠️  Payment requires sending ETH manually for now.');
      console.log('   1. Send ' + priceEth.toFixed(6) + ' ETH to the publisher');
      console.log('   2. Get the transaction hash');
      console.log('   3. Run: agentstore install ' + agent.agent_id + ' --tx-hash 0x...');

      if (!options.txHash) {
        process.exit(1);
      }

      console.log('\nVerifying payment...');
      const purchase = await purchaseAgent(agent.agent_id, wallet.address, options.txHash);

      if (!purchase) {
        console.log('❌ Payment verification failed.');
        process.exit(1);
      }

      entitlementToken = purchase.entitlement_token;
      expiresAt = purchase.expires_at;
      console.log('✓ Payment verified!');
    }
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

  // Save entitlement for paid agents
  if (entitlementToken) {
    const entitlements = loadEntitlements();
    const existingIdx = entitlements.findIndex((e) => e.agentId === agent.agent_id);
    const newEntitlement: Entitlement = {
      agentId: agent.agent_id,
      token: entitlementToken,
      expiresAt: expiresAt,
    };

    if (existingIdx >= 0) {
      entitlements[existingIdx] = newEntitlement;
    } else {
      entitlements.push(newEntitlement);
    }

    saveEntitlements(entitlements);
    console.log(`  ✓ Saved entitlement to ${ENTITLEMENTS_FILE}`);
  }

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

  // Find the gateway executable - try multiple locations
  const possiblePaths = [
    // Installed globally via npm
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@agentstore', 'gateway', 'dist', 'index.js'),
    // Local development
    path.join(__dirname, '..', '..', 'gateway', 'dist', 'index.js'),
    // Relative to cwd
    path.join(process.cwd(), 'packages', 'gateway', 'dist', 'index.js'),
    // Hardcoded for this project
    '/Users/zion/agentstore/packages/gateway/dist/index.js',
  ];

  let gatewayPath = possiblePaths.find((p) => fs.existsSync(p));

  if (!gatewayPath) {
    console.log('⚠️  Gateway not found. Using default path.');
    console.log('   Make sure to build the gateway: cd packages/gateway && npm run build');
    gatewayPath = '/Users/zion/agentstore/packages/gateway/dist/index.js';
  }

  servers['agentstore-gateway'] = {
    command: 'node',
    args: [gatewayPath],
  };

  console.log(`   Gateway path: ${gatewayPath}`);

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
  .option('--tx-hash <hash>', 'Transaction hash for paid agent purchase')
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

program
  .command('browse')
  .description('Browse agents in the marketplace')
  .option('-s, --search <query>', 'Search for agents')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action(async (options: { search?: string; tag?: string }) => {
    try {
      let url = `${API_BASE}/api/agents`;
      const params: string[] = [];
      if (options.search) params.push(`search=${encodeURIComponent(options.search)}`);
      if (options.tag) params.push(`tag=${encodeURIComponent(options.tag)}`);
      if (params.length > 0) url += '?' + params.join('&');

      const response = await fetch(url);
      if (!response.ok) {
        console.error('Failed to fetch agents');
        process.exit(1);
      }

      const data = (await response.json()) as { agents: ApiAgent[] };
      const agents = data.agents || [];

      if (agents.length === 0) {
        console.log('No agents found.');
        return;
      }

      console.log(`\n📦 AgentStore Marketplace (${agents.length} agents)\n`);

      for (const agent of agents) {
        const price = agent.pricing?.model === 'free' ? 'FREE' : `$${agent.pricing?.amount || 0}`;
        const featured = (agent as unknown as { is_featured?: boolean }).is_featured ? '⭐ ' : '';

        console.log(`  ${featured}${agent.name}`);
        console.log(`    ID: ${agent.agent_id}`);
        console.log(`    ${agent.type === 'open' ? '🆓' : '💰'} ${price} | by ${agent.publisher?.display_name || 'Unknown'}`);
        console.log(`    ${(agent.description || '').slice(0, 70)}${(agent.description || '').length > 70 ? '...' : ''}`);
        console.log();
      }

      console.log('Install with: agentstore install <agent_id>');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program.parse();
