import { describe, it, expect } from 'vitest';
import {
  encryptKey,
  decryptKey,
  generatePassword,
  hashPassword,
  isValidPrivateKey,
  isValidAddress,
} from './encryption.js';

describe('Encryption utilities', () => {
  const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testPassword = 'test-password-123';

  describe('encryptKey / decryptKey', () => {
    it('encrypts and decrypts a private key correctly', () => {
      const encrypted = encryptKey(testPrivateKey, testPassword);
      const decrypted = decryptKey(encrypted, testPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('produces different ciphertext for same input (random IV/salt)', () => {
      const encrypted1 = encryptKey(testPrivateKey, testPassword);
      const encrypted2 = encryptKey(testPrivateKey, testPassword);

      expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it('fails to decrypt with wrong password', () => {
      const encrypted = encryptKey(testPrivateKey, testPassword);

      expect(() => decryptKey(encrypted, 'wrong-password')).toThrow();
    });

    it('fails to decrypt with tampered ciphertext', () => {
      const encrypted = encryptKey(testPrivateKey, testPassword);

      // Tamper with the encrypted data
      const tamperedEncrypted = {
        ...encrypted,
        encryptedKey: 'ff' + encrypted.encryptedKey.slice(2),
      };

      expect(() => decryptKey(tamperedEncrypted, testPassword)).toThrow();
    });

    it('fails to decrypt with tampered auth tag', () => {
      const encrypted = encryptKey(testPrivateKey, testPassword);

      // Tamper with auth tag (last 32 hex chars)
      const tamperedEncrypted = {
        ...encrypted,
        encryptedKey: encrypted.encryptedKey.slice(0, -32) + '0'.repeat(32),
      };

      expect(() => decryptKey(tamperedEncrypted, testPassword)).toThrow();
    });

    it('encrypts empty string', () => {
      const encrypted = encryptKey('', testPassword);
      const decrypted = decryptKey(encrypted, testPassword);

      expect(decrypted).toBe('');
    });

    it('handles unicode characters', () => {
      const unicodeKey = '0x🔐secure🔐key🔐';
      const encrypted = encryptKey(unicodeKey, testPassword);
      const decrypted = decryptKey(encrypted, testPassword);

      expect(decrypted).toBe(unicodeKey);
    });
  });

  describe('generatePassword', () => {
    it('generates a 64-character hex string', () => {
      const password = generatePassword();

      expect(password).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(password)).toBe(true);
    });

    it('generates unique passwords', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 100; i++) {
        passwords.add(generatePassword());
      }

      expect(passwords.size).toBe(100);
    });
  });

  describe('hashPassword', () => {
    it('produces consistent hash for same input', () => {
      const hash1 = hashPassword('mypassword');
      const hash2 = hashPassword('mypassword');

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', () => {
      const hash1 = hashPassword('password1');
      const hash2 = hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });

    it('produces 64-character hex hash', () => {
      const hash = hashPassword('test');

      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });
  });

  describe('isValidPrivateKey', () => {
    it('accepts valid private key', () => {
      expect(isValidPrivateKey(testPrivateKey)).toBe(true);
    });

    it('rejects key without 0x prefix', () => {
      expect(isValidPrivateKey('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(false);
    });

    it('rejects key that is too short', () => {
      expect(isValidPrivateKey('0x1234567890abcdef')).toBe(false);
    });

    it('rejects key that is too long', () => {
      expect(isValidPrivateKey('0x' + 'a'.repeat(65))).toBe(false);
    });

    it('rejects key with invalid hex characters', () => {
      expect(isValidPrivateKey('0xgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg')).toBe(false);
    });

    it('accepts uppercase hex', () => {
      expect(isValidPrivateKey('0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890')).toBe(true);
    });
  });

  describe('isValidAddress', () => {
    it('accepts valid address', () => {
      expect(isValidAddress('0x71483B877c40eb2BF99230176947F5ec1c2351cb')).toBe(true);
    });

    it('rejects address without 0x prefix', () => {
      expect(isValidAddress('71483B877c40eb2BF99230176947F5ec1c2351cb')).toBe(false);
    });

    it('rejects address that is too short', () => {
      expect(isValidAddress('0x71483B877c40eb2BF99230')).toBe(false);
    });

    it('rejects address that is too long', () => {
      expect(isValidAddress('0x71483B877c40eb2BF99230176947F5ec1c2351cb00')).toBe(false);
    });

    it('rejects address with invalid characters', () => {
      expect(isValidAddress('0xZZZZZB877c40eb2BF99230176947F5ec1c2351cb')).toBe(false);
    });

    it('accepts all lowercase', () => {
      expect(isValidAddress('0x71483b877c40eb2bf99230176947f5ec1c2351cb')).toBe(true);
    });

    it('accepts all uppercase', () => {
      expect(isValidAddress('0x71483B877C40EB2BF99230176947F5EC1C2351CB')).toBe(true);
    });
  });
});

describe('Spend limit logic', () => {
  interface TransactionRecord {
    amountUsd: number;
    timestamp: string;
    status: 'confirmed' | 'pending' | 'failed';
  }

  function checkSpendLimit(
    amountUsd: number,
    txHistory: TransactionRecord[],
    limits: { perTransaction: number; daily: number; weekly: number }
  ): { allowed: boolean; reason?: string } {
    // Check per-transaction limit
    if (amountUsd > limits.perTransaction) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd} exceeds per-transaction limit of $${limits.perTransaction}`,
      };
    }

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Check daily limit
    const dailySpent = txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneDayAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    if (dailySpent + amountUsd > limits.daily) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of $${limits.daily}`,
      };
    }

    // Check weekly limit
    const weeklySpent = txHistory
      .filter((tx) => new Date(tx.timestamp).getTime() > oneWeekAgo && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    if (weeklySpent + amountUsd > limits.weekly) {
      return {
        allowed: false,
        reason: `Would exceed weekly limit of $${limits.weekly}`,
      };
    }

    return { allowed: true };
  }

  const defaultLimits = { perTransaction: 100, daily: 500, weekly: 2000 };

  it('allows transaction within all limits', () => {
    const result = checkSpendLimit(50, [], defaultLimits);
    expect(result.allowed).toBe(true);
  });

  it('rejects transaction exceeding per-transaction limit', () => {
    const result = checkSpendLimit(150, [], defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per-transaction limit');
  });

  it('rejects transaction that would exceed daily limit', () => {
    const recentTx: TransactionRecord = {
      amountUsd: 450,
      timestamp: new Date().toISOString(),
      status: 'confirmed',
    };

    const result = checkSpendLimit(100, [recentTx], defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('daily limit');
  });

  it('ignores pending transactions for limit calculation', () => {
    const pendingTx: TransactionRecord = {
      amountUsd: 450,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    const result = checkSpendLimit(100, [pendingTx], defaultLimits);
    expect(result.allowed).toBe(true);
  });

  it('ignores failed transactions for limit calculation', () => {
    const failedTx: TransactionRecord = {
      amountUsd: 450,
      timestamp: new Date().toISOString(),
      status: 'failed',
    };

    const result = checkSpendLimit(100, [failedTx], defaultLimits);
    expect(result.allowed).toBe(true);
  });

  it('ignores transactions older than 24 hours for daily limit', () => {
    const oldTx: TransactionRecord = {
      amountUsd: 450,
      timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      status: 'confirmed',
    };

    const result = checkSpendLimit(100, [oldTx], defaultLimits);
    expect(result.allowed).toBe(true);
  });

  it('rejects transaction that would exceed weekly limit', () => {
    // Create transactions spread across the week totaling $1950
    const txHistory: TransactionRecord[] = [];
    for (let i = 0; i < 5; i++) {
      txHistory.push({
        amountUsd: 390, // 5 * 390 = 1950, plus 100 = 2050 > 2000
        timestamp: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(), // 1-5 days ago (not today to avoid daily limit)
        status: 'confirmed',
      });
    }

    const result = checkSpendLimit(100, txHistory, defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('weekly limit');
  });

  it('ignores transactions older than 7 days for weekly limit', () => {
    const oldTx: TransactionRecord = {
      amountUsd: 1900,
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'confirmed',
    };

    const result = checkSpendLimit(100, [oldTx], defaultLimits);
    expect(result.allowed).toBe(true);
  });

  it('allows transaction exactly at the limit', () => {
    const result = checkSpendLimit(100, [], defaultLimits);
    expect(result.allowed).toBe(true);
  });
});
