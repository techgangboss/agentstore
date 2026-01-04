import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type Hash,
  type TransactionReceipt,
} from 'viem';
import { mainnet } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

// mev-commit RPC endpoint for Ethereum mainnet
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

const WALLET_DIR = path.join(process.env.HOME || '~', '.agentstore');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');
const KEYSTORE_FILE = path.join(WALLET_DIR, 'wallet.keystore');
const TX_HISTORY_FILE = path.join(WALLET_DIR, 'tx_history.json');

interface WalletConfig {
  address: string;
  createdAt: string;
  network: 'mainnet';
  rpcEndpoint: string;
  spendLimits: {
    perTransaction: number; // in USD equivalent
    daily: number;
    weekly: number;
  };
  allowedPublishers: string[]; // empty = all allowed
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

// Create public client for reading blockchain state
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

export class AgentStoreWallet {
  private privateKey: `0x${string}` | null = null;
  private config: WalletConfig | null = null;
  private txHistory: TransactionRecord[] = [];

  async init(): Promise<void> {
    await this.ensureWalletDir();

    if (this.walletExists()) {
      await this.loadWallet();
    }
    // Don't auto-create wallet - require explicit setup
  }

  private async ensureWalletDir(): Promise<void> {
    if (!fs.existsSync(WALLET_DIR)) {
      fs.mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
    }
  }

  walletExists(): boolean {
    return fs.existsSync(WALLET_FILE) && fs.existsSync(KEYSTORE_FILE);
  }

  async createWallet(): Promise<{ address: string; mnemonic?: string }> {
    if (this.walletExists()) {
      throw new Error('Wallet already exists. Use importWallet() to replace it.');
    }

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    this.config = {
      address: account.address,
      createdAt: new Date().toISOString(),
      network: 'mainnet',
      rpcEndpoint: MEV_COMMIT_RPC,
      spendLimits: {
        perTransaction: 100, // $100 max per transaction
        daily: 500, // $500 daily limit
        weekly: 2000, // $2000 weekly limit
      },
      allowedPublishers: [],
    };

    // Encrypt and save private key
    const password = await this.getOrCreatePassword();
    const encrypted = this.encryptKey(privateKey, password);
    fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(encrypted), { mode: 0o600 });

    // Save wallet config
    fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });

    // Initialize empty tx history
    fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify([]), { mode: 0o600 });

    this.privateKey = privateKey;
    this.txHistory = [];

    return { address: account.address };
  }

  async importWallet(privateKeyHex: string): Promise<{ address: string }> {
    // Validate private key format
    if (!privateKeyHex.startsWith('0x') || privateKeyHex.length !== 66) {
      throw new Error('Invalid private key format. Must be 0x-prefixed 64 hex chars.');
    }

    const privateKey = privateKeyHex as `0x${string}`;
    const account = privateKeyToAccount(privateKey);

    this.config = {
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

    const password = await this.getOrCreatePassword();
    const encrypted = this.encryptKey(privateKey, password);
    fs.writeFileSync(KEYSTORE_FILE, JSON.stringify(encrypted), { mode: 0o600 });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify([]), { mode: 0o600 });

    this.privateKey = privateKey;
    this.txHistory = [];

    return { address: account.address };
  }

  private async loadWallet(): Promise<void> {
    this.config = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    const encrypted: EncryptedKeystore = JSON.parse(fs.readFileSync(KEYSTORE_FILE, 'utf-8'));

    const password = await this.getOrCreatePassword();
    this.privateKey = this.decryptKey(encrypted, password);

    // Load transaction history
    if (fs.existsSync(TX_HISTORY_FILE)) {
      this.txHistory = JSON.parse(fs.readFileSync(TX_HISTORY_FILE, 'utf-8'));
    }
  }

  private encryptKey(key: string, password: string): EncryptedKeystore {
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

  private decryptKey(encrypted: EncryptedKeystore, password: string): `0x${string}` {
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

  private async getOrCreatePassword(): Promise<string> {
    // Check for explicit password in environment (for CI/automation)
    if (process.env.AGENTSTORE_WALLET_PASSWORD) {
      return crypto.createHash('sha256').update(process.env.AGENTSTORE_WALLET_PASSWORD).digest('hex');
    }

    // Check for password file (more secure than env var)
    const passwordFile = path.join(WALLET_DIR, '.password');
    if (fs.existsSync(passwordFile)) {
      const password = fs.readFileSync(passwordFile, 'utf-8').trim();
      return crypto.createHash('sha256').update(password).digest('hex');
    }

    // Derive from multiple machine-specific sources for entropy
    // Note: This is a fallback. For production, use OS keychain via keytar package
    const sources = [
      os.hostname(),
      os.userInfo().username,
      os.homedir(),
      os.platform(),
      os.arch(),
      // Add some file-based entropy if available
      fs.existsSync('/etc/machine-id') ? fs.readFileSync('/etc/machine-id', 'utf-8').trim() : '',
      process.env.USER || process.env.USERNAME || '',
    ].filter(Boolean);

    const machineId = sources.join(':');
    return crypto.createHash('sha256').update(machineId).digest('hex');
  }

  getAddress(): string {
    if (!this.config) throw new Error('Wallet not initialized. Run /wallet setup first.');
    return this.config.address;
  }

  async getBalance(): Promise<{ wei: bigint; eth: string; usd: number }> {
    if (!this.config) throw new Error('Wallet not initialized');

    const balanceWei = await publicClient.getBalance({
      address: this.config.address as `0x${string}`,
    });

    const ethBalance = formatEther(balanceWei);

    // Get ETH price for USD conversion
    let ethPrice = 2000; // fallback
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const data = (await response.json()) as { ethereum?: { usd?: number } };
      ethPrice = data.ethereum?.usd || 2000;
    } catch {
      // Use fallback price
    }

    const usdBalance = parseFloat(ethBalance) * ethPrice;

    return {
      wei: balanceWei,
      eth: ethBalance,
      usd: Math.round(usdBalance * 100) / 100,
    };
  }

  async checkSpendLimit(amountUsd: number): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config) throw new Error('Wallet not initialized');

    // Check per-transaction limit
    if (amountUsd > this.config.spendLimits.perTransaction) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd} exceeds per-transaction limit of $${this.config.spendLimits.perTransaction}`,
      };
    }

    // Check daily limit
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dailySpent = this.txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    if (dailySpent + amountUsd > this.config.spendLimits.daily) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of $${this.config.spendLimits.daily} (spent: $${dailySpent.toFixed(2)})`,
      };
    }

    // Check weekly limit
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklySpent = this.txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    if (weeklySpent + amountUsd > this.config.spendLimits.weekly) {
      return {
        allowed: false,
        reason: `Would exceed weekly limit of $${this.config.spendLimits.weekly} (spent: $${weeklySpent.toFixed(2)})`,
      };
    }

    return { allowed: true };
  }

  async sendPayment(params: {
    to: string;
    amountUsd: number;
    agentId: string;
  }): Promise<{ txHash: Hash; amountEth: string }> {
    if (!this.privateKey || !this.config) {
      throw new Error('Wallet not initialized');
    }

    // Check spend limits
    const limitCheck = await this.checkSpendLimit(params.amountUsd);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.reason);
    }

    // Check publisher allowlist
    if (
      this.config.allowedPublishers.length > 0 &&
      !this.config.allowedPublishers.includes(params.to.toLowerCase())
    ) {
      throw new Error(`Publisher ${params.to} is not in your allowed publishers list`);
    }

    // Get current ETH price
    let ethPrice = 2000;
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const data = (await response.json()) as { ethereum?: { usd?: number } };
      ethPrice = data.ethereum?.usd || 2000;
    } catch {
      // Use fallback
    }

    // Convert USD to ETH
    const amountEth = params.amountUsd / ethPrice;
    const amountWei = parseEther(amountEth.toFixed(18));

    // Check balance
    const balance = await this.getBalance();
    if (balance.wei < amountWei) {
      throw new Error(
        `Insufficient balance: have ${balance.eth} ETH, need ${amountEth.toFixed(6)} ETH`
      );
    }

    // Create wallet client for signing
    const account = privateKeyToAccount(this.privateKey);
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(MEV_COMMIT_RPC),
    });

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
    this.txHistory.push(txRecord);
    this.saveTxHistory();

    // Wait for confirmation in background
    this.waitForConfirmation(txHash).catch(console.error);

    return { txHash, amountEth: amountEth.toFixed(6) };
  }

  private async waitForConfirmation(txHash: Hash): Promise<void> {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 2,
        timeout: 120_000, // 2 minutes
      });

      // Update transaction status
      const txIndex = this.txHistory.findIndex((tx) => tx.txHash === txHash);
      if (txIndex !== -1) {
        this.txHistory[txIndex].status = receipt.status === 'success' ? 'confirmed' : 'failed';
        this.saveTxHistory();
      }
    } catch (error) {
      // Mark as failed on timeout/error
      const txIndex = this.txHistory.findIndex((tx) => tx.txHash === txHash);
      if (txIndex !== -1) {
        this.txHistory[txIndex].status = 'failed';
        this.saveTxHistory();
      }
    }
  }

  private saveTxHistory(): void {
    fs.writeFileSync(TX_HISTORY_FILE, JSON.stringify(this.txHistory, null, 2), { mode: 0o600 });
  }

  getTransactionHistory(): TransactionRecord[] {
    return [...this.txHistory];
  }

  getConfig(): WalletConfig | null {
    return this.config;
  }

  async updateSpendLimits(limits: Partial<WalletConfig['spendLimits']>): Promise<void> {
    if (!this.config) throw new Error('Wallet not initialized');

    this.config.spendLimits = { ...this.config.spendLimits, ...limits };
    fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });
  }

  async addAllowedPublisher(address: string): Promise<void> {
    if (!this.config) throw new Error('Wallet not initialized');

    const normalized = address.toLowerCase();
    if (!this.config.allowedPublishers.includes(normalized)) {
      this.config.allowedPublishers.push(normalized);
      fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    }
  }

  async removeAllowedPublisher(address: string): Promise<void> {
    if (!this.config) throw new Error('Wallet not initialized');

    const normalized = address.toLowerCase();
    this.config.allowedPublishers = this.config.allowedPublishers.filter((p) => p !== normalized);
    fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });
  }

  // Get spending stats
  async getSpendingStats(): Promise<{
    daily: { spent: number; limit: number; remaining: number };
    weekly: { spent: number; limit: number; remaining: number };
  }> {
    if (!this.config) throw new Error('Wallet not initialized');

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const dailySpent = this.txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    const weeklySpent = this.txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    return {
      daily: {
        spent: Math.round(dailySpent * 100) / 100,
        limit: this.config.spendLimits.daily,
        remaining: Math.round((this.config.spendLimits.daily - dailySpent) * 100) / 100,
      },
      weekly: {
        spent: Math.round(weeklySpent * 100) / 100,
        limit: this.config.spendLimits.weekly,
        remaining: Math.round((this.config.spendLimits.weekly - weeklySpent) * 100) / 100,
      },
    };
  }
}

// Export singleton instance
export const wallet = new AgentStoreWallet();
