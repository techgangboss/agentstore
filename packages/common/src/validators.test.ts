import { describe, it, expect } from 'vitest';
import {
  EthereumAddressSchema,
  TransactionHashSchema,
  AgentIdSchema,
  PublisherIdSchema,
  VersionSchema,
  PricingSchema,
  PurchaseRequestSchema,
} from './validators.js';

describe('EthereumAddressSchema', () => {
  it('accepts valid Ethereum addresses', () => {
    const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f1E123';
    const result = EthereumAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(validAddress.toLowerCase());
    }
  });

  it('rejects invalid addresses', () => {
    expect(EthereumAddressSchema.safeParse('0x123').success).toBe(false);
    expect(EthereumAddressSchema.safeParse('not-an-address').success).toBe(false);
    expect(EthereumAddressSchema.safeParse('').success).toBe(false);
  });

  it('rejects addresses with wrong length', () => {
    const tooShort = '0x742d35Cc6634C0532925a3b844Bc9e7595f1E1';
    const tooLong = '0x742d35Cc6634C0532925a3b844Bc9e7595f1E1234';
    expect(EthereumAddressSchema.safeParse(tooShort).success).toBe(false);
    expect(EthereumAddressSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('TransactionHashSchema', () => {
  it('accepts valid transaction hashes', () => {
    const validHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const result = TransactionHashSchema.safeParse(validHash);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(validHash.toLowerCase());
    }
  });

  it('rejects invalid hashes', () => {
    expect(TransactionHashSchema.safeParse('0x123').success).toBe(false);
    expect(TransactionHashSchema.safeParse('not-a-hash').success).toBe(false);
  });
});

describe('AgentIdSchema', () => {
  it('accepts valid agent IDs', () => {
    expect(AgentIdSchema.safeParse('acme.research-agent').success).toBe(true);
    expect(AgentIdSchema.safeParse('abc.xyz').success).toBe(true);
    expect(AgentIdSchema.safeParse('my-publisher.my-agent').success).toBe(true);
  });

  it('rejects invalid agent IDs', () => {
    expect(AgentIdSchema.safeParse('-invalid').success).toBe(false);
    expect(AgentIdSchema.safeParse('invalid-').success).toBe(false);
    expect(AgentIdSchema.safeParse('UPPERCASE').success).toBe(false);
    expect(AgentIdSchema.safeParse('ab').success).toBe(false); // too short
  });
});

describe('PublisherIdSchema', () => {
  it('accepts valid publisher IDs', () => {
    expect(PublisherIdSchema.safeParse('acme-corp').success).toBe(true);
    expect(PublisherIdSchema.safeParse('abc').success).toBe(true);
    expect(PublisherIdSchema.safeParse('my-publisher-123').success).toBe(true);
  });

  it('rejects invalid publisher IDs', () => {
    expect(PublisherIdSchema.safeParse('-invalid').success).toBe(false);
    expect(PublisherIdSchema.safeParse('a').success).toBe(false); // too short
    expect(PublisherIdSchema.safeParse('has.dots').success).toBe(false);
  });
});

describe('VersionSchema', () => {
  it('accepts valid semantic versions', () => {
    expect(VersionSchema.safeParse('1.0.0').success).toBe(true);
    expect(VersionSchema.safeParse('10.20.30').success).toBe(true);
    expect(VersionSchema.safeParse('0.0.1').success).toBe(true);
  });

  it('rejects invalid versions', () => {
    expect(VersionSchema.safeParse('1.0').success).toBe(false);
    expect(VersionSchema.safeParse('v1.0.0').success).toBe(false);
    expect(VersionSchema.safeParse('1.0.0-beta').success).toBe(false);
  });
});

describe('PricingSchema', () => {
  it('accepts valid pricing', () => {
    const result = PricingSchema.safeParse({
      model: 'one_time',
      currency: 'USD',
      amount: 9.99,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const result = PricingSchema.safeParse({ model: 'free' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
      expect(result.data.amount).toBe(0);
    }
  });

  it('rejects negative amounts', () => {
    const result = PricingSchema.safeParse({
      model: 'one_time',
      amount: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe('PurchaseRequestSchema', () => {
  it('accepts valid purchase requests', () => {
    const result = PurchaseRequestSchema.safeParse({
      agent_id: 'acme.test-agent',
      wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f1E123',
      tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wallet_address).toBe('0x742d35cc6634c0532925a3b844bc9e7595f1e123');
    }
  });

  it('rejects invalid purchase requests', () => {
    expect(
      PurchaseRequestSchema.safeParse({
        agent_id: 'acme.test',
        wallet_address: 'invalid',
        tx_hash: '0x123',
      }).success
    ).toBe(false);
  });
});
