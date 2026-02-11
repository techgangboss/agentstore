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
  http,
  parseAbi,
  formatUnits,
  parseUnits,
} from 'viem';
import { mainnet } from 'viem/chains';
import * as keytar from 'keytar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://api.agentstore.tools';
const ETHEREUM_RPC = 'https://ethereum-rpc.publicnode.com';
const KEYCHAIN_SERVICE = 'agentstore-wallet';
const KEYCHAIN_ACCOUNT = 'encryption-key';

// USDC contract on Ethereum mainnet
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const USDC_DECIMALS = 6;
const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

// EIP-712 domain for USDC (EIP-3009 transferWithAuthorization)
const USDC_EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 1,
  verifyingContract: USDC_ADDRESS,
} as const;

// EIP-712 types for TransferWithAuthorization
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

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
  transport: http(ETHEREUM_RPC),
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
  amountUsdc: string;
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
    rpcEndpoint: ETHEREUM_RPC,
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
    rpcEndpoint: ETHEREUM_RPC,
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

// Get USDC balance for an address
async function getUsdcBalance(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });
}

// Format USDC from raw bigint (6 decimals) to human-readable string
function formatUsdc(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

// Parse USDC from human-readable string to raw bigint
function parseUsdc(amount: string | number): bigint {
  const str = typeof amount === 'number' ? amount.toFixed(USDC_DECIMALS) : amount;
  return parseUnits(str, USDC_DECIMALS);
}

// Trigger funding flow and wait for USDC funds
async function triggerFundingFlow(requiredUsdc: number): Promise<boolean> {
  const config = loadWalletConfig();
  if (!config) return false;

  console.log('\n💳 Fund your wallet with USDC\n');
  console.log(`   Wallet: ${config.address}`);
  console.log(`   Required: $${requiredUsdc.toFixed(2)} USDC\n`);

  // Get initial USDC balance
  const initialBalance = await getUsdcBalance(config.address);

  // Try to get onramp URL from API
  const response = await fetch(`${API_BASE}/api/onramp/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: config.address,
      amount_usd: Math.ceil(requiredUsdc),
      asset: 'USDC',
    }),
  });

  const result = await response.json() as {
    success?: boolean;
    onramp_url?: string;
    error?: string;
    manual_instructions?: { step1: string; step2: string; step3: string };
  };

  if (!response.ok || !result.success) {
    showFundingOptions(config.address, requiredUsdc);
    return false;
  }

  // Open browser for Coinbase onramp
  const { exec } = await import('child_process');
  const openCmd = process.platform === 'darwin'
    ? `open "${result.onramp_url}"`
    : process.platform === 'win32'
      ? `start "${result.onramp_url}"`
      : `xdg-open "${result.onramp_url}"`;

  exec(openCmd);
  console.log('🌐 Coinbase opened in your browser.\n');
  console.log('   Complete the USDC purchase, then wait for funds to arrive.');
  console.log('   Or use one of the other options below while waiting.\n');
  showFundingOptionsShort(config.address);
  console.log('\n⏳ Waiting for USDC (Ctrl+C to cancel)...\n');

  // Poll for USDC balance
  const requiredRaw = parseUsdc(requiredUsdc);
  const startTime = Date.now();
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes
  const pollInterval = 10 * 1000; // 10 seconds

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const currentBalance = await getUsdcBalance(config.address);

      if (currentBalance >= requiredRaw && currentBalance > initialBalance) {
        const added = currentBalance - initialBalance;
        console.log(`\n✅ USDC received! +$${formatUsdc(added)} USDC\n`);
        return true;
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   Checking USDC balance... (${elapsed}s elapsed)`);
    } catch {
      // Ignore poll errors
    }
  }

  console.log('\n⚠️  Timeout waiting for USDC. Run install again after funding.');
  return false;
}

// Show all funding options
function showFundingOptions(address: string, requiredUsdc: number): void {
  console.log('   Three ways to fund your wallet:\n');
  console.log('   1. Buy with card (Coinbase):');
  console.log('      agentstore wallet fund --wait\n');
  console.log('   2. Send USDC directly (from any wallet/exchange):');
  console.log(`      Send $${requiredUsdc.toFixed(2)} USDC (Ethereum) to:`);
  console.log(`      ${address}\n`);
  console.log('   3. Import an existing wallet with USDC:');
  console.log('      agentstore wallet import\n');
  console.log('   After funding, run the install command again.');
}

// Short version for inline display
function showFundingOptionsShort(address: string): void {
  console.log('   Other ways to add USDC:');
  console.log(`   - Send USDC (Ethereum) to: ${address}`);
  console.log('   - Import existing wallet: agentstore wallet import');
}

// Get wallet balance (USDC)
async function getWalletBalance(): Promise<{ usdc: string; usdcRaw: bigint }> {
  const config = loadWalletConfig();
  if (!config) throw new Error('Wallet not initialized');

  const raw = await getUsdcBalance(config.address);
  return {
    usdc: formatUsdc(raw),
    usdcRaw: raw,
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

// Prompt for secret input (masked)
function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (ch: string) => {
      if (ch === '\n' || ch === '\r') {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === '\u0003') {
        // Ctrl+C
        process.exit(0);
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// x402 Payment Required response shape
interface PaymentRequiredResponse {
  amount: string;
  currency: 'USDC';
  payTo: string;
  resource: { type: string; agent_id: string; description: string };
  x402: {
    version: string;
    chain_id: number;
    token: string;
    facilitator: string;
    domain: { name: string; version: string; chainId: number; verifyingContract: string };
  };
  nonce: string;
  expires_at: string;
  fee_split: {
    platform_address: string;
    platform_amount: string;
    platform_percent: number;
    publisher_address: string;
    publisher_amount: string;
    publisher_percent: number;
  };
}

// Check agent access — returns entitlement if already purchased, or 402 payment params
async function getPaymentRequired(
  agentId: string,
  walletAddress: string
): Promise<
  | { status: 'granted'; entitlement: { token: string; expires_at: string | null } | null; install: unknown }
  | { status: 'payment_required'; payment: PaymentRequiredResponse }
  | { status: 'error'; error: string }
> {
  try {
    const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}/access`, {
      headers: { 'X-Wallet-Address': walletAddress },
    });

    if (response.status === 200) {
      const data = await response.json() as {
        access: string;
        entitlement: { token: string; expires_at: string | null } | null;
        install: unknown;
      };
      return { status: 'granted', entitlement: data.entitlement, install: data.install };
    }

    if (response.status === 402) {
      const data = await response.json() as { payment: PaymentRequiredResponse };
      return { status: 'payment_required', payment: data.payment };
    }

    const data = await response.json() as { error?: string };
    return { status: 'error', error: data.error || `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

// Sign EIP-3009 TransferWithAuthorization typed data
async function signTransferAuthorization(
  payment: PaymentRequiredResponse,
  privateKey: `0x${string}`,
  walletAddress: string
): Promise<{
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  v: number;
  r: string;
  s: string;
}> {
  const account = privateKeyToAccount(privateKey);
  const value = parseUsdc(payment.amount);
  const validBefore = BigInt(Math.floor(new Date(payment.expires_at).getTime() / 1000));
  const authNonce = ('0x' + crypto.randomBytes(32).toString('hex')) as `0x${string}`;

  const signature = await account.signTypedData({
    domain: USDC_EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: walletAddress as `0x${string}`,
      to: payment.payTo as `0x${string}`,
      value,
      validAfter: 0n,
      validBefore,
      nonce: authNonce,
    },
  });

  // Parse signature into v, r, s components
  const r = ('0x' + signature.slice(2, 66)) as string;
  const s = ('0x' + signature.slice(66, 130)) as string;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    from: walletAddress,
    to: payment.payTo,
    value: value.toString(),
    validAfter: '0',
    validBefore: validBefore.toString(),
    nonce: authNonce,
    v,
    r,
    s,
  };
}

// Submit signed x402 payment to API
async function submitX402Payment(
  agentId: string,
  walletAddress: string,
  payment: PaymentRequiredResponse,
  authorization: {
    from: string; to: string; value: string;
    validAfter: string; validBefore: string; nonce: string;
    v: number; r: string; s: string;
  }
): Promise<{
  entitlement_token: string;
  install: unknown;
  proof: unknown;
} | null> {
  try {
    const response = await fetch(`${API_BASE}/api/payments/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        wallet_address: walletAddress,
        payment_required: {
          amount: payment.amount,
          currency: payment.currency,
          payTo: payment.payTo,
          nonce: payment.nonce,
          expires_at: payment.expires_at,
        },
        authorization,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      if (response.status === 409) {
        // Already purchased — re-check /access for the entitlement
        console.log('Agent already purchased. Retrieving entitlement...');
        const access = await getPaymentRequired(agentId, walletAddress);
        if (access.status === 'granted' && access.entitlement) {
          return {
            entitlement_token: access.entitlement.token,
            install: access.install,
            proof: null,
          };
        }
      }
      console.error(`Payment failed: ${error.error || response.statusText}`);
      return null;
    }

    return await response.json() as {
      entitlement_token: string;
      install: unknown;
      proof: unknown;
    };
  } catch (error) {
    console.error(`Payment error: ${error instanceof Error ? error.message : error}`);
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

  const hasTools = tools.length > 0;
  const agentWrapper = (agent.install as any).agent_wrapper;

  let content: string;

  if (hasTools) {
    content = `---
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
  } else {
    // Simple agent without MCP tools - use agent_wrapper content or description
    const wrapperContent = agentWrapper?.content || agent.description;
    content = `---
description: ${agent.description}
---

# ${agent.name}

**Publisher:** ${agent.publisher.display_name}
**Version:** ${agent.version}
**Type:** ${agent.type === 'open' ? 'Free' : 'Paid'}

${wrapperContent}

## Usage

This is a prompt-based agent. Reference it by asking Claude to follow the instructions from "${agent.name}".
`;
  }

  const skillFile = path.join(SKILLS_DIR, `${agent.agent_id.replace(/\./g, '-')}.md`);
  fs.writeFileSync(skillFile, content);
  console.log(`  Created skill file: ${skillFile}`);
}

// Install command
async function installAgent(agentId: string, options: { yes?: boolean; pay?: boolean }): Promise<void> {
  // --pay is a true alias for --yes
  if (options.pay) options.yes = true;

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

  // For paid agents, handle x402 USDC payment flow
  let entitlementToken: string | null = null;
  let expiresAt: string | null = null;

  if (agent.type === 'proprietary' && agent.pricing.model !== 'free') {
    const priceUsd = getPriceUsd(agent.pricing);

    // Lazy wallet creation
    const { address: walletAddress, created: walletCreated } = await ensureWalletExists();
    if (walletCreated) {
      console.log('\n🔐 Wallet created automatically');
      console.log(`   Address: ${walletAddress}`);
    }

    console.log('\n💰 Payment Required:');
    console.log(`   Price: $${priceUsd.toFixed(2)} USDC`);
    console.log(`   Your wallet: ${walletAddress}`);

    // Check local entitlements first (skip API call if already purchased)
    const localEntitlements = loadEntitlements();
    const localEntitlement = localEntitlements.find((e) => e.agentId === agent.agent_id);
    if (localEntitlement) {
      console.log('\n✓ Already purchased! Using existing entitlement.');
      entitlementToken = localEntitlement.token;
      expiresAt = localEntitlement.expiresAt;
    }

    // If no local entitlement, check server
    if (!entitlementToken) {
      const accessResult = await getPaymentRequired(agent.agent_id, walletAddress);

      if (accessResult.status === 'error') {
        console.log(`\n❌ Access check failed: ${accessResult.error}`);
        process.exit(1);
      }

      if (accessResult.status === 'granted' && accessResult.entitlement) {
        console.log('\n✓ Already purchased! Using existing entitlement.');
        entitlementToken = accessResult.entitlement.token;
        expiresAt = accessResult.entitlement.expires_at;
      }
    }

    if (!entitlementToken) {
      // Need to pay — fetch 402 details
      const accessResult = await getPaymentRequired(agent.agent_id, walletAddress);
      if (accessResult.status !== 'payment_required') {
        if (accessResult.status === 'granted') {
          console.log('\n✓ Access granted (no payment needed).');
        } else {
          console.log(`\n❌ Unexpected access status: ${accessResult.status}`);
          process.exit(1);
        }
      } else {
      const paymentRequired = accessResult.payment;

      // Check USDC balance
      try {
        const balance = await getWalletBalance();
        const requiredRaw = parseUsdc(paymentRequired.amount);
        console.log(`   Your USDC balance: $${balance.usdc}`);

        if (balance.usdcRaw < requiredRaw) {
          console.log(`\n⚠️  Insufficient USDC. Need $${paymentRequired.amount}, have $${balance.usdc}`);

          const funded = await triggerFundingFlow(priceUsd);
          if (!funded) {
            process.exit(1);
          }

          // Re-check balance after funding
          const newBalance = await getWalletBalance();
          console.log(`   New USDC balance: $${newBalance.usdc}`);

          if (newBalance.usdcRaw < requiredRaw) {
            console.log(`\n❌ Still insufficient. Need $${paymentRequired.amount}, have $${newBalance.usdc}`);
            process.exit(1);
          }
        }
      } catch (error) {
        console.log(`\n❌ Could not check balance: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }

      // Check spend limits
      const config = loadWalletConfig()!;
      const txHistory = loadTxHistory();
      const limitCheck = checkSpendLimit(priceUsd, config, txHistory);
      if (!limitCheck.allowed) {
        console.log(`\n❌ Spend limit exceeded: ${limitCheck.reason}`);
        process.exit(1);
      }

      // Confirm payment (skip with --yes or --pay)
      if (!options.yes) {
        const confirm = await prompt(`\nPay $${paymentRequired.amount} USDC for "${agent.name}"? (y/n) `);
        if (confirm !== 'y' && confirm !== 'yes') {
          console.log('Payment cancelled.');
          process.exit(0);
        }
      }

      // Sign the EIP-3009 authorization
      const privateKey = await loadPrivateKey();
      if (!privateKey) {
        console.log('\n❌ Could not load wallet private key');
        process.exit(1);
      }

      console.log('\n🔐 Signing USDC authorization...');
      const authorization = await signTransferAuthorization(paymentRequired, privateKey, walletAddress);

      // Submit to API for facilitator relay
      console.log('🔄 Processing payment via x402...');
      const result = await submitX402Payment(agent.agent_id, walletAddress, paymentRequired, authorization);

      if (!result) {
        console.log('❌ Payment processing failed.');
        process.exit(1);
      }

      entitlementToken = result.entitlement_token;
      expiresAt = null;
      console.log('✓ Payment confirmed! (gasless USDC via x402)');

      // Record in local tx history
      const txProof = result.proof as { tx_hash?: string } | undefined;
      txHistory.push({
        txHash: txProof?.tx_hash || 'x402-' + Date.now(),
        to: paymentRequired.payTo,
        amountUsdc: paymentRequired.amount,
        amountUsd: priceUsd,
        agentId: agent.agent_id,
        timestamp: new Date().toISOString(),
        status: 'confirmed',
      });
      saveTxHistory(txHistory);
      }
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
  if (toolCount > 0) {
    console.log(`   Tools: ${toolCount} available`);
    console.log('\n   To use, ask Claude to call the tools, e.g.:');
    const firstTool = agent.install.gateway_routes[0]?.tools[0];
    if (firstTool) {
      console.log(`   "Use ${agent.agent_id}:${firstTool.name}"`);
    }
  } else {
    console.log(`   Type: Prompt-based agent (no MCP tools)`);
    console.log(`\n   To use, ask Claude to follow the "${agent.name}" instructions.`);
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
    // Local development (relative to CLI dist)
    path.join(__dirname, '..', '..', 'gateway', 'dist', 'index.js'),
    // Relative to cwd
    path.join(process.cwd(), 'packages', 'gateway', 'dist', 'index.js'),
  ];

  let gatewayPath = possiblePaths.find((p) => fs.existsSync(p));

  if (!gatewayPath) {
    // Default to the local dev relative path
    gatewayPath = path.join(__dirname, '..', '..', 'gateway', 'dist', 'index.js');
    console.log('⚠️  Gateway not found at expected paths.');
    console.log('   Make sure to build the gateway: cd packages/gateway && npm run build');
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
  .option('-y, --yes', 'Skip confirmation / auto-confirm payment')
  .option('--pay', 'Auto-confirm payment (alias for --yes)')
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
      console.log('Paid agents prompt for USDC payment automatically.');
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
      console.log('\n⚠️  Fund this address with USDC to purchase paid agents.');
      console.log('   Options:');
      console.log('   1. Buy with card: agentstore wallet fund');
      console.log(`   2. Send USDC (Ethereum) from any wallet to: ${address}`);
      console.log('   3. Import existing wallet: agentstore wallet import');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('balance')
  .description('Show wallet USDC balance')
  .action(async () => {
    try {
      if (!walletExists()) {
        console.log('No wallet configured. Run: agentstore wallet setup');
        process.exit(1);
      }

      const config = loadWalletConfig();
      console.log(`\nWallet: ${config?.address}`);

      console.log('Fetching USDC balance...');
      const balance = await getWalletBalance();
      console.log(`USDC Balance: $${balance.usdc}`);
      console.log('Network: Ethereum Mainnet');

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
        console.log(`    $${tx.amountUsdc || tx.amountUsd} USDC → ${tx.to.slice(0, 10)}...`);
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
  .command('import')
  .description('Import an existing wallet by private key')
  .action(async () => {
    try {
      if (walletExists()) {
        console.log('Wallet already exists. Delete ~/.agentstore/wallet.* files to import a new one.');
        process.exit(1);
      }

      const key = await promptSecret('Enter private key (0x...): ');
      if (!key.startsWith('0x') || key.length !== 66) {
        console.log('Invalid private key format. Must be a 0x-prefixed 64-character hex string.');
        process.exit(1);
      }

      ensureDirectories();
      const account = privateKeyToAccount(key as `0x${string}`);

      const config: WalletConfig = {
        address: account.address,
        createdAt: new Date().toISOString(),
        network: 'mainnet',
        rpcEndpoint: ETHEREUM_RPC,
        spendLimits: { perTransaction: 100, daily: 500, weekly: 2000 },
        allowedPublishers: [],
      };

      const password = await getOrCreatePassword();
      const encrypted = encryptKey(key, password);

      fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(encrypted), { mode: 0o600 });
      fs.writeFileSync(WALLET_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
      fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify([]), { mode: 0o600 });

      // Show USDC balance
      const usdcRaw = await getUsdcBalance(account.address);
      console.log(`\n✅ Wallet imported!`);
      console.log(`   Address: ${account.address}`);
      console.log(`   USDC Balance: $${formatUsdc(usdcRaw)}`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

walletCmd
  .command('fund')
  .description('Fund your wallet with USDC')
  .option('-a, --amount <usd>', 'Amount in USD to purchase', parseFloat)
  .option('--no-open', 'Print URL instead of opening browser')
  .option('--wait', 'Wait and poll for USDC to arrive')
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

      console.log('\n💳 Fund Your Wallet with USDC\n');
      console.log(`   Wallet: ${config.address}`);

      // Get initial USDC balance for comparison
      let initialBalance: bigint | undefined;
      try {
        initialBalance = await getUsdcBalance(config.address);
        console.log(`   Current USDC: $${formatUsdc(initialBalance)}`);
      } catch {
        // Ignore balance fetch errors
      }

      if (options.amount) {
        console.log(`   Amount: $${options.amount} USDC`);
      }

      console.log('\n🔄 Generating secure onramp session...');

      // Call API to get onramp URL
      const response = await fetch(`${API_BASE}/api/onramp/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: config.address,
          amount_usd: options.amount,
          asset: 'USDC',
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
        console.log('\n⚠️  Coinbase Onramp unavailable.\n');
        showFundingOptions(config.address, options.amount || 10);
        process.exit(1);
      }

      const onrampUrl = result.onramp_url!;

      if (options.open === false) {
        console.log('\n✅ Onramp URL generated:\n');
        console.log(`   ${onrampUrl}\n`);
        console.log('   Open this URL in your browser to purchase USDC.');
      } else {
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

        console.log('   Complete the USDC purchase in your browser.');
        console.log('   USDC will arrive in your wallet within a few minutes.\n');
        showFundingOptionsShort(config.address);
      }

      // Poll for USDC balance changes if --wait flag is set
      if (options.wait && initialBalance !== undefined) {
        console.log('\n⏳ Waiting for USDC to arrive (Ctrl+C to cancel)...\n');

        const startTime = Date.now();
        const maxWaitTime = 10 * 60 * 1000; // 10 minutes
        const pollInterval = 15 * 1000; // 15 seconds

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          try {
            const currentBalance = await getUsdcBalance(config.address);

            if (currentBalance > initialBalance) {
              const added = currentBalance - initialBalance;

              console.log('\n✅ USDC received!\n');
              console.log(`   Added: $${formatUsdc(added)} USDC`);
              console.log(`   New balance: $${formatUsdc(currentBalance)} USDC`);
              process.exit(0);
            }

            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            process.stdout.write(`\r   Checking USDC... (${elapsed}s elapsed)`);
          } catch {
            // Ignore individual poll errors
          }
        }

        console.log('\n\n⚠️  Timed out waiting for USDC.');
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
