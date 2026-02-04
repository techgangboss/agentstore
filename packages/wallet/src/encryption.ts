// @agentstore/wallet - Encryption utilities (extracted for testing)

import * as crypto from 'crypto';

export interface EncryptedKeystore {
  iv: string;
  encryptedKey: string;
  salt: string;
}

/**
 * Encrypts a private key using AES-256-GCM with PBKDF2 key derivation
 */
export function encryptKey(key: string, password: string): EncryptedKeystore {
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

/**
 * Decrypts an encrypted keystore
 */
export function decryptKey(encrypted: EncryptedKeystore, password: string): string {
  const salt = Buffer.from(encrypted.salt, 'hex');
  const iv = Buffer.from(encrypted.iv, 'hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const encryptedData = encrypted.encryptedKey.slice(0, -32);
  const authTag = Buffer.from(encrypted.encryptedKey.slice(-32), 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a secure random password
 */
export function generatePassword(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a password for storage comparison
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Validates a private key format (0x + 64 hex chars)
 */
export function isValidPrivateKey(key: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(key);
}

/**
 * Validates an Ethereum address format (0x + 40 hex chars)
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
