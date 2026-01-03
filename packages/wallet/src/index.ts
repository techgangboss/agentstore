import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { base } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const WALLET_DIR = path.join(process.env.HOME || '~', '.agentstore');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');
const KEYSTORE_FILE = path.join(WALLET_DIR, 'wallet.keystore');

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

interface WalletConfig {
  address: string;
  createdAt: string;
  spendLimits: {
    perTransaction: number; // in USDC
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

export class AgentStoreWallet {
  private privateKey: `0x${string}` | null = null;
  private config: WalletConfig | null = null;

  async init(): Promise<void> {
    await this.ensureWalletDir();

    if (this.walletExists()) {
      await this.loadWallet();
    } else {
      await this.createWallet();
    }
  }

  private async ensureWalletDir(): Promise<void> {
    if (!fs.existsSync(WALLET_DIR)) {
      fs.mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private walletExists(): boolean {
    return fs.existsSync(WALLET_FILE) && fs.existsSync(KEYSTORE_FILE);
  }

  private async createWallet(): Promise<void> {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    this.config = {
      address: account.address,
      createdAt: new Date().toISOString(),
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

    this.privateKey = privateKey;
    console.log(`Wallet created: ${account.address}`);
  }

  private async loadWallet(): Promise<void> {
    this.config = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    const encrypted: EncryptedKeystore = JSON.parse(fs.readFileSync(KEYSTORE_FILE, 'utf-8'));

    const password = await this.getOrCreatePassword();
    this.privateKey = this.decryptKey(encrypted, password);
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
    // In production, this would use OS keychain (macOS Keychain, Windows Credential Manager, etc.)
    // For now, use a fixed derivation from machine ID
    const machineId = require('os').hostname() + process.env.USER;
    return crypto.createHash('sha256').update(machineId).digest('hex');
  }

  getAddress(): string {
    if (!this.config) throw new Error('Wallet not initialized');
    return this.config.address;
  }

  async getBalance(): Promise<{ usdc: string; formatted: string }> {
    if (!this.config) throw new Error('Wallet not initialized');

    // TODO: Implement actual USDC balance check via viem
    // For now, return placeholder
    return {
      usdc: '0',
      formatted: '0.00 USDC',
    };
  }

  async checkSpendLimit(amount: number): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config) throw new Error('Wallet not initialized');

    if (amount > this.config.spendLimits.perTransaction) {
      return {
        allowed: false,
        reason: `Amount exceeds per-transaction limit of $${this.config.spendLimits.perTransaction}`,
      };
    }

    // TODO: Check daily/weekly limits against transaction history
    return { allowed: true };
  }

  async signX402Payment(params: {
    to: string;
    amount: number;
    agentId: string;
  }): Promise<{ signature: string; txHash: string }> {
    if (!this.privateKey || !this.config) throw new Error('Wallet not initialized');

    // Check spend limits
    const limitCheck = await this.checkSpendLimit(params.amount);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.reason);
    }

    const account = privateKeyToAccount(this.privateKey);

    // TODO: Implement actual x402 payment signing
    // This would create and sign a USDC transfer transaction

    return {
      signature: '0x...', // Placeholder
      txHash: '0x...', // Placeholder
    };
  }

  getConfig(): WalletConfig | null {
    return this.config;
  }

  async updateSpendLimits(limits: Partial<WalletConfig['spendLimits']>): Promise<void> {
    if (!this.config) throw new Error('Wallet not initialized');

    this.config.spendLimits = { ...this.config.spendLimits, ...limits };
    fs.writeFileSync(WALLET_FILE, JSON.stringify(this.config, null, 2));
  }
}

export const wallet = new AgentStoreWallet();
