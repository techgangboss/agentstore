#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import {
  generatePrivateKey,
  privateKeyToAccount,
} from 'viem/accounts';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type Hash,
} from 'viem';
import { mainnet } from 'viem/chains';
import * as keytar from 'keytar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://api-inky-seven.vercel.app';
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';
const KEYCHAIN_SERVICE = 'agentstore-wallet';
const KEYCHAIN_ACCOUNT = 'encryption-key';

// File paths
const HOME_DIR = os.homedir();
const AGENTSTORE_DIR = path.join(HOME_DIR, '.agentstore');
const ROUTES_FILE = path.join(AGENTSTORE_DIR, 'routes.json');
const ENTITLEMENTS_FILE = path.join(AGENTSTORE_DIR, 'entitlements.json');
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills', 'agentstore');
const WALLET_FILE = path.join(AGENTSTORE_DIR, 'wallet.json');
const KEYSTORE_FILE = path.join(AGENTSTORE_DIR, 'wallet.keystore');
const TX_HISTORY_FILE = path.join(AGENTSTORE_DIR, 'tx_history.json');

// Create public client for reading blockchain state
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

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
  allowedPublishers: string[];
}

interface EncryptedKeystore {
  iv: string;
  encryptedKey: string;
  salt: string;
}

interface TransactionRecord {
  txHash: string;
  to: string;
  amountEth: string;
  amountUsd: number;
  agentId: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
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
    amount?: number;
    amount_usd?: number;
    currency?: string;
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
    payout_address?: string | null;
  };
  pricing: {
    model: string;
    amount?: number;
    amount_usd?: number;
    currency?: string;
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

// Get price from pricing object (handles both amount and amount_usd)
function getPriceUsd(pricing: { model: string; amount?: number; amount_usd?: number }): number {
  return pricing.amount ?? pricing.amount_usd ?? 0;
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

// Check if wallet exists
function walletExists(): boolean {
  return fs.existsSync(WALLET_FILE) && fs.existsSync(KEYSTORE_FILE);
}

// Load transaction history
function loadTxHistory(): TransactionRecord[] {
  try {
    if (fs.existsSync(TX_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(TX_HISTORY_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return [];
}

// Save transaction history
function saveTxHistory(history: TransactionRecord[]): void {
  fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify(history, null, 2), { mode: 0o600 });
}

// Encrypt private key
function encryptKey(key: string, password: string): EncryptedKeystore {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    encryptedKey: encrypted + authTag.toString('hex'),
  };
}

// Decrypt private key
function decryptKey(encrypted: EncryptedKeystore, password: string): `0x${string}` {
  const salt = Buffer.from(encrypted.salt, 'hex');
  const iv = Buffer.from(encrypted.iv, 'hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const encryptedData = encrypted.encryptedKey.slice(0, -32);
  const authTag = Buffer.from(encrypted.encryptedKey.slice(-32), 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted as `0x${string}`;
}

// Get or create password from keychain or file
async function getOrCreatePassword(): Promise<string> {
  // Priority 1: Environment variable
  if (process.env.AGENTSTORE_WALLET_PASSWORD) {
    return crypto.createHash('sha256').update(process.env.AGENTSTORE_WALLET_PASSWORD).digest('hex');
  }

  // Priority 2: OS keychain
  try {
    const keychainPassword = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (keychainPassword) {
      return keychainPassword;
    }

    const newPassword = crypto.randomBytes(32).toString('hex');
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, newPassword);
    return newPassword;
  } catch {
    console.warn('OS keychain unavailable, using file-based password');
  }

  // Priority 3: Password file
  const passwordFile = path.join(AGENTSTORE_DIR, '.password');
  if (fs.existsSync(passwordFile)) {
    const password = fs.readFileSync(passwordFile, 'utf-8').trim();
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Priority 4: Generate new password file
  const generatedPassword = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(passwordFile, generatedPassword, { mode: 0o600 });
  return crypto.createHash('sha256').update(generatedPassword).digest('hex');
}

// Load private key from keystore
async function loadPrivateKey(): Promise<`0x${string}` | null> {
  if (!fs.existsSync(KEYSTORE_FILE)) return null;

  try {
    const encrypted: EncryptedKeystore = JSON.parse(fs.readFileSync(KEYSTORE_FILE, 'utf-8'));
    const password = await getOrCreatePassword();
    return decryptKey(encrypted, password);
  } catch (error) {
    console.error('Failed to decrypt wallet:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Create new wallet
async function createNewWallet(): Promise<{ address: string }> {
  ensureDirectories();

  if (walletExists()) {
    throw new Error('Wallet already exists. Delete ~/.agentstore/wallet.* files to create a new one.');
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const config: WalletConfig = {
    address: account.address,
    createdAt: new Date().toISOString(),
    network: 'mainnet',
    rpcEndpoint: MEV_COMMIT_RPC,
    spendLimits: {
      perTransaction: 100,
      daily: 500,
      weekly: 2000,
    },
    allowedPublishers: [],
  };

  const password = await getOrCreatePassword();
  const encrypted = encryptKey(privateKey, password);

  fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(encrypted), { mode: 0o600 });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify([]), { mode: 0o600 });

  return { address: account.address };
}

// Create wallet silently (for lazy creation during install)
async function ensureWalletExists(): Promise<{ address: string; created: boolean }> {
  if (walletExists()) {
    const config = loadWalletConfig();
    return { address: config!.address, created: false };
  }

  // Create wallet silently
  ensureDirectories();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const config: WalletConfig = {
    address: account.address,
    createdAt: new Date().toISOString(),
    network: 'mainnet',
    rpcEndpoint: MEV_COMMIT_RPC,
    spendLimits: {
      perTransaction: 100,
      daily: 500,
      weekly: 2000,
    },
    allowedPublishers: [],
  };

  const password = await getOrCreatePassword();
  const encrypted = encryptKey(privateKey, password);

  fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(encrypted), { mode: 0o600 });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify([]), { mode: 0o600 });

  return { address: account.address, created: true };
}

// Trigger funding flow and wait for funds
async function triggerFundingFlow(requiredUsd: number): Promise<boolean> {
  const config = loadWalletConfig();
  if (!config) return false;

  console.log('\n💳 Opening Coinbase to fund your wallet...\n');
  console.log(`   Wallet: ${config.address}`);
  console.log(`   Required: ~$${requiredUsd} USD\n`);

  // Get initial balance
  const initialBalance = await publicClient.getBalance({
    address: config.address as `0x${string}`,
  });

  // Get onramp URL from API
  const response = await fetch(`${API_BASE}/api/onramp/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: config.address,
      amount_usd: Math.ceil(requiredUsd * 1.1), // Add 10% buffer for gas
    }),
  });

  const result = await response.json() as {
    success?: boolean;
    onramp_url?: string;
    error?: string;
    manual_instructions?: { step1: string; step2: string; step3: string };
  };

  if (!response.ok || !result.success) {
    if (result.manual_instructions) {
      console.log('⚠️  Coinbase Onramp not configured.\n');
      console.log('   Manual funding instructions:');
      console.log(`   1. ${result.manual_instructions.step1}`);
      console.log(`   2. ${result.manual_instructions.step2}`);
      console.log(`   3. ${result.manual_instructions.step3}`);
      console.log(`\n   Your wallet address: ${config.address}`);
      console.log('\n   After funding, run the install command again.');
    }
    return false;
  }

  // Open browser
  const { exec } = await import('child_process');
  const openCmd = process.platform === 'darwin'
    ? `open "${result.onramp_url}"`
    : process.platform === 'win32'
      ? `start "${result.onramp_url}"`
      : `xdg-open "${result.onramp_url}"`;

  exec(openCmd);
  console.log('🌐 Coinbase opened in your browser.\n');
  console.log('   Complete the purchase, then wait for funds to arrive.');
  console.log('⏳ Waiting for funds (Ctrl+C to cancel)...\n');

  // Poll for balance
  const startTime = Date.now();
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes
  const pollInterval = 10 * 1000; // 10 seconds

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const currentBalance = await publicClient.getBalance({
        address: config.address as `0x${string}`,
      });

      if (currentBalance > initialBalance) {
        const added = currentBalance - initialBalance;
        console.log(`\n✅ Funds received! +${formatEther(added)} ETH\n`);
        return true;
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   Checking balance... (${elapsed}s elapsed)`);
    } catch {
      // Ignore poll errors
    }
  }

  console.log('\n⚠️  Timeout waiting for funds. Run install again after funding.');
  return false;
}

// Get wallet balance
async function getWalletBalance(): Promise<{ eth: string; usd: number }> {
  const config = loadWalletConfig();
  if (!config) throw new Error('Wallet not initialized');

  const balanceWei = await publicClient.getBalance({
    address: config.address as `0x${string}`,
  });

  const ethBalance = formatEther(balanceWei);
  const ethPrice = await getEthPrice();
  const usdBalance = parseFloat(ethBalance) * ethPrice;

  return {
    eth: ethBalance,
    usd: Math.round(usdBalance * 100) / 100,
  };
}

// Check spend limits
function checkSpendLimit(amountUsd: number, config: WalletConfig, txHistory: TransactionRecord[]): { allowed: boolean; reason?: string } {
  // Per-transaction limit
  if (amountUsd > config.spendLimits.perTransaction) {
    return {
      allowed: false,
      reason: `Amount $${amountUsd} exceeds per-transaction limit of $${config.spendLimits.perTransaction}`,
    };
  }

  // Daily limit
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const dailySpent = txHistory
    .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
    .reduce((sum, tx) => sum + tx.amountUsd, 0);

  if (dailySpent + amountUsd > config.spendLimits.daily) {
    return {
      allowed: false,
      reason: `Would exceed daily limit of $${config.spendLimits.daily} (spent: $${dailySpent.toFixed(2)})`,
    };
  }

  // Weekly limit
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklySpent = txHistory
    .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
    .reduce((sum, tx) => sum + tx.amountUsd, 0);

  if (weeklySpent + amountUsd > config.spendLimits.weekly) {
    return {
      allowed: false,
      reason: `Would exceed weekly limit of $${config.spendLimits.weekly} (spent: $${weeklySpent.toFixed(2)})`,
    };
  }

  return { allowed: true };
}

// Send payment for agent
async function sendAgentPayment(params: {
  to: string;
  amountUsd: number;
  agentId: string;
}): Promise<{ txHash: Hash; amountEth: string }> {
  const config = loadWalletConfig();
  if (!config) throw new Error('Wallet not initialized');

  const privateKey = await loadPrivateKey();
  if (!privateKey) throw new Error('Could not load wallet private key');

  const txHistory = loadTxHistory();

  // Check spend limits
  const limitCheck = checkSpendLimit(params.amountUsd, config, txHistory);
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.reason);
  }

  // Check publisher allowlist
  if (config.allowedPublishers.length > 0 && !config.allowedPublishers.includes(params.to.toLowerCase())) {
    throw new Error(`Publisher ${params.to} is not in your allowed publishers list`);
  }

  // Get current ETH price
  const ethPrice = await getEthPrice();
  const amountEth = params.amountUsd / ethPrice;
  const amountWei = parseEther(amountEth.toFixed(18));

  // Check balance
  const balance = await getWalletBalance();
  if (parseFloat(balance.eth) < amountEth) {
    throw new Error(`Insufficient balance: have ${balance.eth} ETH, need ${amountEth.toFixed(6)} ETH`);
  }

  // Create wallet client for signing
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(MEV_COMMIT_RPC),
  });

  console.log('Sending transaction...');

  // Send transaction
  const txHash = await walletClient.sendTransaction({
    to: params.to as `0x${string}`,
    value: amountWei,
  });

  // Record transaction
  const txRecord: TransactionRecord = {
    txHash,
    to: params.to,
    amountEth: amountEth.toFixed(6),
    amountUsd: params.amountUsd,
    agentId: params.agentId,
    timestamp: new Date().toISOString(),
    status: 'pending',
  };
  txHistory.push(txRecord);
  saveTxHistory(txHistory);

  console.log(`Transaction sent: ${txHash}`);

  // Wait for confirmation
  try {
    console.log('Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
      timeout: 120_000,
    });

    const txIndex = txHistory.findIndex((tx) => tx.txHash === txHash);
    const txRecord = txHistory[txIndex];
    if (txIndex !== -1 && txRecord) {
      txRecord.status = receipt.status === 'success' ? 'confirmed' : 'failed';
      saveTxHistory(txHistory);
    }

    if (receipt.status !== 'success') {
      throw new Error('Transaction failed on chain');
    }

    console.log('✓ Transaction confirmed!');
  } catch (error) {
    const txIndex = txHistory.findIndex((tx) => tx.txHash === txHash);
    const txRecord = txHistory[txIndex];
    if (txIndex !== -1 && txRecord) {
      txRecord.status = 'failed';
      saveTxHistory(txHistory);
    }
    throw error;
  }

  return { txHash, amountEth: amountEth.toFixed(6) };
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
async function installAgent(agentId: string, options: { yes?: boolean; txHash?: string; pay?: boolean }): Promise<void> {
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
  console.log(`│ Price: ${agent.pricing.model === 'free' ? 'FREE' : `$${getPriceUsd(agent.pricing)}`}`.padEnd(50) + '│');
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
    // Lazy wallet creation - create if doesn't exist
    const { address: walletAddress, created: walletCreated } = await ensureWalletExists();
    if (walletCreated) {
      console.log('\n🔐 Wallet created automatically');
      console.log(`   Address: ${walletAddress}`);
    }

    const wallet = loadWalletConfig()!;
    const ethPrice = await getEthPrice();
    const priceEth = getPriceUsd(agent.pricing) / ethPrice;

    console.log('\n💰 Payment Required:');
    console.log(`   Price: $${getPriceUsd(agent.pricing)} (~${priceEth.toFixed(6)} ETH)`);
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
      let txHash = options.txHash;

      // Direct payment with --pay flag
      if (options.pay && !txHash) {
        const payoutAddress = agent.publisher.payout_address;
        if (!payoutAddress) {
          console.log('\n❌ Publisher has no payout address configured.');
          console.log('   Contact the publisher or use --tx-hash with manual payment.');
          process.exit(1);
        }

        // Check balance and trigger funding if needed
        try {
          const balance = await getWalletBalance();
          console.log(`\n   Your balance: ${balance.eth} ETH ($${balance.usd})`);

          // Auto-trigger funding flow if insufficient balance
          if (balance.usd < getPriceUsd(agent.pricing)) {
            console.log(`\n⚠️  Insufficient balance. Need $${getPriceUsd(agent.pricing)}, have $${balance.usd}`);

            const funded = await triggerFundingFlow(getPriceUsd(agent.pricing));
            if (!funded) {
              process.exit(1);
            }

            // Re-check balance after funding
            const newBalance = await getWalletBalance();
            console.log(`   New balance: ${newBalance.eth} ETH ($${newBalance.usd})`);

            if (newBalance.usd < getPriceUsd(agent.pricing)) {
              console.log(`\n❌ Still insufficient. Need $${getPriceUsd(agent.pricing)}, have $${newBalance.usd}`);
              process.exit(1);
            }
          }
        } catch (error) {
          console.log(`\n❌ Could not check balance: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }

        // Confirm payment
        if (!options.yes) {
          const confirm = await prompt(`\nPay $${getPriceUsd(agent.pricing)} (~${priceEth.toFixed(6)} ETH) to ${payoutAddress.slice(0, 10)}...? (y/n) `);
          if (confirm !== 'y' && confirm !== 'yes') {
            console.log('Payment cancelled.');
            process.exit(0);
          }
        }

        // Send payment
        try {
          console.log('\n🔄 Processing payment...');
          const payment = await sendAgentPayment({
            to: payoutAddress,
            amountUsd: getPriceUsd(agent.pricing),
            agentId: agent.agent_id,
          });
          txHash = payment.txHash;
          console.log(`✓ Payment sent: ${txHash}`);
        } catch (error) {
          console.log(`\n❌ Payment failed: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      }

      // Verify payment with API
      if (!txHash) {
        console.log('\n💳 Payment options:');
        console.log('   1. Auto-pay: agentstore install ' + agent.agent_id + ' --pay');
        console.log('   2. Manual:   Send ' + priceEth.toFixed(6) + ' ETH to ' + (agent.publisher.payout_address || '[publisher]'));
        console.log('                Then: agentstore install ' + agent.agent_id + ' --tx-hash 0x...');
        process.exit(1);
      }

      console.log('\nVerifying payment with marketplace...');
      const purchase = await purchaseAgent(agent.agent_id, wallet.address, txHash);

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
  .option('--pay', 'Pay for agent directly from wallet')
  .option('--tx-hash <hash>', 'Transaction hash for manual payment verification')
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
        const priceAmount = agent.pricing ? getPriceUsd(agent.pricing) : 0;
        const isFree = agent.pricing?.model === 'free' || priceAmount === 0;
        const price = isFree ? 'FREE' : `$${priceAmount}`;
        const priceEmoji = isFree ? '🆓' : '💰';
        const featured = (agent as unknown as { is_featured?: boolean }).is_featured ? '⭐ ' : '';

        console.log(`  ${featured}${agent.name}`);
        console.log(`    ID: ${agent.agent_id}`);
        console.log(`    ${priceEmoji} ${price} | by ${agent.publisher?.display_name || 'Unknown'}`);
        console.log(`    ${(agent.description || '').slice(0, 70)}${(agent.description || '').length > 70 ? '...' : ''}`);
        console.log();
      }

      console.log('Install with: agentstore install <agent_id>');
      console.log('For paid agents: agentstore install <agent_id> --pay');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Wallet commands
const walletCmd = program
  .command('wallet')
  .description('Manage your AgentStore wallet');

walletCmd
  .command('setup')
  .description('Create a new wallet')
  .action(async () => {
    try {
      if (walletExists()) {
        const config = loadWalletConfig();
        console.log('Wallet already exists.');
        console.log(`Address: ${config?.address}`);
        return;
      }

      console.log('Creating new wallet...');
      const { address } = await createNewWallet();
      console.log('\n✅ Wallet created!');
      console.log(`\nAddress: ${address}`);
      console.log('\n⚠️  Fund this address with ETH to purchase paid agents.');
      console.log('   Use any exchange or wallet to send ETH to this address.');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('balance')
  .description('Show wallet balance')
  .action(async () => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      console.log(`\nAddress: ${config?.address}`);

      console.log('Fetching balance...');
      const balance = await getWalletBalance();
      console.log(`\n💰 Balance: ${balance.eth} ETH (~$${balance.usd})`);

      // Show spending stats
      const txHistory = loadTxHistory();
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const dailySpent = txHistory
        .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

      const weeklySpent = txHistory
        .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

      if (config?.spendLimits) {
        console.log(`\n📊 Spending Limits:`);
        console.log(`   Per transaction: $${config.spendLimits.perTransaction}`);
        console.log(`   Daily: $${dailySpent.toFixed(2)} / $${config.spendLimits.daily}`);
        console.log(`   Weekly: $${weeklySpent.toFixed(2)} / $${config.spendLimits.weekly}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('history')
  .description('Show transaction history')
  .action(() => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const txHistory = loadTxHistory();

      if (txHistory.length === 0) {
        console.log('No transactions yet.');
        return;
      }

      console.log(`\n📜 Transaction History (${txHistory.length} transactions)\n`);

      for (const tx of txHistory.slice(-10).reverse()) {
        const date = new Date(tx.timestamp).toLocaleDateString();
        const statusIcon = tx.status === 'confirmed' ? '✓' : tx.status === 'pending' ? '⏳' : '✗';
        console.log(`  ${statusIcon} ${date} | ${tx.agentId}`);
        console.log(`    ${tx.amountEth} ETH ($${tx.amountUsd}) → ${tx.to.slice(0, 10)}...`);
        console.log(`    ${tx.txHash.slice(0, 20)}...`);
        console.log();
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('address')
  .description('Show wallet address')
  .action(() => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      console.log(config?.address);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('fund')
  .description('Fund your wallet with a credit card via Coinbase')
  .option('-a, --amount <usd>', 'Amount in USD to purchase', parseFloat)
  .option('--no-open', 'Print URL instead of opening browser')
  .option('--wait', 'Wait and poll for funds to arrive')
  .action(async (options: { amount?: number; open?: boolean; wait?: boolean }) => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      if (!config) {
        console.log('Failed to load wallet config');
        process.exit(1);
      }

      console.log('\n💳 Coinbase Onramp - Fund Your Wallet\n');
      console.log(`   Wallet: ${config.address}`);

      // Get initial balance for comparison
      let initialBalance: bigint | undefined;
      if (options.wait) {
        try {
          initialBalance = await publicClient.getBalance({
            address: config.address as `0x${string}`,
          });
          console.log(`   Current balance: ${formatEther(initialBalance)} ETH`);
        } catch {
          // Ignore balance fetch errors
        }
      }

      if (options.amount) {
        console.log(`   Amount: $${options.amount} USD`);
      }

      console.log('\n🔄 Generating secure onramp session...');

      // Call API to get onramp URL
      const response = await fetch(`${API_BASE}/api/onramp/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: config.address,
          amount_usd: options.amount,
        }),
      });

      const result = await response.json() as {
        success?: boolean;
        onramp_url?: string;
        error?: string;
        message?: string;
        manual_instructions?: { step1: string; step2: string; step3: string };
        fallback?: { message: string; step1: string; step2: string; wallet_address: string };
      };

      if (!response.ok || !result.success) {
        // Handle fallback for when CDP credentials aren't configured
        if (result.manual_instructions) {
          console.log('\n⚠️  Coinbase Onramp not configured on server.\n');
          console.log('   Manual funding instructions:');
          console.log(`   1. ${result.manual_instructions.step1}`);
          console.log(`   2. ${result.manual_instructions.step2}`);
          console.log(`   3. ${result.manual_instructions.step3}`);
          console.log(`\n   Your wallet address: ${config.address}`);
        } else {
          console.log(`\n❌ Error: ${result.error || result.message || 'Unknown error'}`);
          if (result.fallback) {
            console.log(`\n   ${result.fallback.message}`);
            console.log(`   1. ${result.fallback.step1}`);
            console.log(`   2. ${result.fallback.step2}`);
          }
        }
        process.exit(1);
      }

      const onrampUrl = result.onramp_url!;

      if (options.open === false) {
        // Just print the URL
        console.log('\n✅ Onramp URL generated:\n');
        console.log(`   ${onrampUrl}\n`);
        console.log('   Open this URL in your browser to complete the purchase.');
      } else {
        // Open in default browser
        console.log('\n🌐 Opening Coinbase in your browser...\n');

        const { exec } = await import('child_process');
        const openCmd = process.platform === 'darwin'
          ? `open "${onrampUrl}"`
          : process.platform === 'win32'
            ? `start "${onrampUrl}"`
            : `xdg-open "${onrampUrl}"`;

        exec(openCmd, (error) => {
          if (error) {
            console.log('Could not open browser. Please open this URL manually:\n');
            console.log(`   ${onrampUrl}\n`);
          }
        });

        console.log('   Complete the purchase in your browser.');
        console.log('   ETH will be sent to your wallet within a few minutes.\n');
      }

      // Poll for balance changes if --wait flag is set
      if (options.wait && initialBalance !== undefined) {
        console.log('⏳ Waiting for funds to arrive (Ctrl+C to cancel)...\n');

        const startTime = Date.now();
        const maxWaitTime = 10 * 60 * 1000; // 10 minutes
        const pollInterval = 15 * 1000; // 15 seconds

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          try {
            const currentBalance = await publicClient.getBalance({
              address: config.address as `0x${string}`,
            });

            if (currentBalance > initialBalance) {
              const added = currentBalance - initialBalance;
              const ethPrice = await getEthPrice();
              const addedUsd = parseFloat(formatEther(added)) * ethPrice;

              console.log('✅ Funds received!\n');
              console.log(`   Added: ${formatEther(added)} ETH (~$${addedUsd.toFixed(2)})`);
              console.log(`   New balance: ${formatEther(currentBalance)} ETH`);
              process.exit(0);
            }

            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            process.stdout.write(`\r   Checking... (${elapsed}s elapsed)`);
          } catch {
            // Ignore individual poll errors
          }
        }

        console.log('\n\n⚠️  Timed out waiting for funds.');
        console.log('   Funds may still arrive - check your balance later with:');
        console.log('   agentstore wallet balance\n');
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Publisher commands
const publisherCmd = program
  .command('publisher')
  .description('Manage your publisher account');

publisherCmd
  .command('register')
  .description('Register as a publisher on AgentStore')
  .requiredOption('-n, --name <name>', 'Publisher name (lowercase, alphanumeric with hyphens, used as unique ID)')
  .requiredOption('-d, --display-name <display_name>', 'Display name for your publisher account')
  .option('-e, --email <email>', 'Contact email (optional)')
  .option('-u, --support-url <url>', 'Support URL for your agents')
  .action(async (options: { name: string; displayName: string; email?: string; supportUrl?: string }) => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      if (!config) {
        console.log('Failed to load wallet config');
        process.exit(1);
      }

      // Validate name format
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(options.name) || options.name.length < 2) {
        console.log('Invalid publisher name. Must be:');
        console.log('  - At least 2 characters');
        console.log('  - Lowercase letters, numbers, and hyphens only');
        console.log('  - Start and end with a letter or number');
        process.exit(1);
      }

      console.log('\n📝 Registering as publisher...');
      console.log(`   Name: ${options.name}`);
      console.log(`   Display Name: ${options.displayName}`);
      console.log(`   Payout Address: ${config.address}`);
      if (options.email) {
        console.log(`   Email: ${options.email}`);
      }
      if (options.supportUrl) {
        console.log(`   Support URL: ${options.supportUrl}`);
      }

      // Submit registration
      console.log('\n📤 Submitting registration...');
      const response = await fetch(`${API_BASE}/api/publishers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: options.name,
          display_name: options.displayName,
          payout_address: config.address,
          email: options.email || undefined,
          support_url: options.supportUrl || undefined,
        }),
      });

      const result = await response.json() as { success?: boolean; error?: string; publisher?: { publisher_id: string } };

      if (!response.ok) {
        console.log(`\n❌ Registration failed: ${result.error || response.statusText}`);
        process.exit(1);
      }

      console.log('\n✅ Publisher registered successfully!');
      console.log(`\n   Your publisher name: ${result.publisher?.publisher_id || options.name}`);
      console.log('\n   Next steps:');
      console.log('   1. Create an agent manifest: agentstore publisher init');
      console.log('   2. Submit your agent: agentstore publisher submit <manifest.json>');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

publisherCmd
  .command('info')
  .description('Show your publisher info')
  .action(async () => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      if (!config) {
        console.log('Failed to load wallet config');
        process.exit(1);
      }

      // Look up publisher by payout address
      const response = await fetch(`${API_BASE}/api/publishers`);
      if (!response.ok) {
        console.log('Failed to fetch publishers');
        process.exit(1);
      }

      const data = await response.json() as { publishers: Array<{ publisher_id: string; display_name: string; support_url?: string; created_at: string }> };

      // Note: We can't directly query by payout_address via the public API
      // For now, list all publishers owned by this wallet would require a new endpoint
      // Just show the wallet address and instruct to check dashboard
      console.log('\n📋 Publisher Account');
      console.log(`   Wallet: ${config.address}`);
      console.log('\n   To see your published agents, visit the AgentStore dashboard');
      console.log('   or use: agentstore browse --search <your-publisher-id>');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

publisherCmd
  .command('submit <manifest>')
  .description('Submit an agent to AgentStore')
  .option('--publish', 'Request immediate publication (requires approval)')
  .action(async (manifestPath: string, options: { publish?: boolean }) => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      if (!config) {
        console.log('Failed to load wallet config');
        process.exit(1);
      }

      const privateKey = await loadPrivateKey();
      if (!privateKey) {
        console.log('Failed to load wallet private key');
        process.exit(1);
      }

      // Read and parse manifest file
      const fullPath = path.resolve(manifestPath);
      if (!fs.existsSync(fullPath)) {
        console.log(`Manifest file not found: ${fullPath}`);
        process.exit(1);
      }

      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      } catch (e) {
        console.log(`Invalid JSON in manifest: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }

      // Validate required fields
      const required = ['agent_id', 'name', 'type', 'description', 'version', 'pricing', 'install'];
      for (const field of required) {
        if (!manifest[field]) {
          console.log(`Missing required field: ${field}`);
          process.exit(1);
        }
      }

      const agentId = manifest.agent_id as string;
      const version = manifest.version as string;

      console.log('\n📦 Submitting Agent to AgentStore\n');
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Name: ${manifest.name}`);
      console.log(`   Version: ${version}`);
      console.log(`   Type: ${manifest.type}`);

      const pricing = manifest.pricing as { model: string; amount?: number };
      console.log(`   Pricing: ${pricing.model === 'free' ? 'Free' : `$${pricing.amount || 0}`}`);

      // Create and sign the submission message
      const message = `Submit agent to AgentStore: ${agentId} v${version}`;
      const account = privateKeyToAccount(privateKey);

      console.log('\n🔐 Signing submission...');
      const signature = await account.signMessage({ message });

      // Submit to API
      console.log('📤 Uploading to marketplace...');
      const response = await fetch(`${API_BASE}/api/publishers/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...manifest,
          tags: manifest.tags || [],
          permissions: manifest.permissions || { requires_network: false, requires_filesystem: false },
          signature,
          message,
        }),
      });

      const result = await response.json() as {
        success?: boolean;
        error?: string;
        details?: unknown;
        action?: string;
        agent?: { agent_id: string; version: string };
        message?: string;
      };

      if (!response.ok) {
        console.log(`\n❌ Submission failed: ${result.error || response.statusText}`);
        if (result.details) {
          console.log('   Details:', JSON.stringify(result.details, null, 2));
        }
        process.exit(1);
      }

      console.log(`\n✅ Agent ${result.action === 'updated' ? 'updated' : 'published'} successfully!`);
      console.log(`\n   Agent ID: ${result.agent?.agent_id || agentId}`);
      console.log(`   Version: ${result.agent?.version || version}`);

      if (result.action === 'created') {
        console.log('\n   🎉 Your agent is now live in the marketplace!');
        console.log('   Users can install it with:');
        console.log(`   agentstore install ${result.agent?.agent_id || agentId}`);
      } else {
        console.log('\n   Your agent has been updated in the marketplace.');
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

publisherCmd
  .command('init')
  .description('Create a sample agent manifest file')
  .option('-o, --output <file>', 'Output file path', 'agent-manifest.json')
  .action((options: { output: string }) => {
    const sampleManifest = {
      agent_id: 'your-publisher-name.your-agent-name',
      name: 'Your Agent Name',
      type: 'open',
      description: 'A brief description of what your agent does (10-1000 characters)',
      version: '1.0.0',
      pricing: {
        model: 'free',
        amount: 0,
        currency: 'USD',
      },
      install: {
        agent_wrapper: {
          format: 'markdown',
          entrypoint: 'agent.md',
        },
        gateway_routes: [
          {
            route_id: 'default',
            mcp_endpoint: 'https://your-mcp-server.com/endpoint',
            tools: [
              {
                name: 'example_tool',
                description: 'What this tool does',
                inputSchema: {
                  type: 'object',
                  properties: {
                    param1: {
                      type: 'string',
                      description: 'Description of param1',
                    },
                  },
                  required: ['param1'],
                },
              },
            ],
            auth: {
              type: 'none',
            },
          },
        ],
      },
      permissions: {
        requires_network: true,
        requires_filesystem: false,
        notes: 'Optional notes about permissions',
      },
      tags: ['Productivity', 'Data'],
    };

    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, JSON.stringify(sampleManifest, null, 2));

    console.log(`\n✅ Sample manifest created: ${outputPath}`);
    console.log('\nNext steps:');
    console.log('1. Edit the manifest with your agent details');
    console.log('2. Update agent_id to: your-publisher-name.agent-name');
    console.log('3. Submit with: agentstore publisher submit ' + options.output);
  });

program.parse();
