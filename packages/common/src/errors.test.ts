import { describe, it, expect } from 'vitest';
import {
  AgentStoreError,
  WalletError,
  PaymentError,
  ValidationError,
  ApiError,
  GatewayError,
  isAgentStoreError,
  isWalletError,
  isPaymentError,
  isValidationError,
  isApiError,
  isGatewayError,
  wrapError,
} from './errors.js';

describe('AgentStoreError', () => {
  it('creates error with code and context', () => {
    const error = new AgentStoreError('Something went wrong', 'TEST_ERROR', { foo: 'bar' });

    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.context).toEqual({ foo: 'bar' });
    expect(error.name).toBe('AgentStoreError');
  });

  it('serializes to JSON correctly', () => {
    const error = new AgentStoreError('Test', 'TEST', { key: 'value' });
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AgentStoreError',
      code: 'TEST',
      message: 'Test',
      context: { key: 'value' },
    });
  });

  it('is instanceof Error', () => {
    const error = new AgentStoreError('Test', 'TEST');
    expect(error instanceof Error).toBe(true);
  });
});

describe('WalletError', () => {
  it('creates wallet error with specific code', () => {
    const error = new WalletError('Wallet not found', 'WALLET_NOT_FOUND');

    expect(error.name).toBe('WalletError');
    expect(error.code).toBe('WALLET_NOT_FOUND');
    expect(error instanceof AgentStoreError).toBe(true);
  });

  it('includes context for debugging', () => {
    const error = new WalletError('Insufficient balance', 'INSUFFICIENT_BALANCE', {
      required: '10.00',
      available: '5.00',
    });

    expect(error.context).toEqual({ required: '10.00', available: '5.00' });
  });
});

describe('PaymentError', () => {
  it('creates payment error with transaction context', () => {
    const error = new PaymentError('Transaction failed', 'TRANSACTION_FAILED', {
      txHash: '0x123',
      reason: 'reverted',
    });

    expect(error.name).toBe('PaymentError');
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(error.context?.txHash).toBe('0x123');
  });
});

describe('ValidationError', () => {
  it('creates validation error with field info', () => {
    const error = new ValidationError('Invalid email format', {
      field: 'email',
    });

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.field).toBe('email');
  });

  it('includes Zod-style issues', () => {
    const error = new ValidationError('Validation failed', {
      issues: [
        { path: 'name', message: 'Required' },
        { path: 'price', message: 'Must be positive' },
      ],
    });

    expect(error.issues).toHaveLength(2);
    expect(error.issues![0]!.path).toBe('name');
  });

  it('serializes issues to JSON', () => {
    const error = new ValidationError('Invalid', {
      field: 'test',
      issues: [{ path: 'x', message: 'bad' }],
    });
    const json = error.toJSON();

    expect(json.field).toBe('test');
    expect(json.issues).toEqual([{ path: 'x', message: 'bad' }]);
  });
});

describe('ApiError', () => {
  it('creates API error with status code', () => {
    const error = new ApiError('Not found', 'NOT_FOUND', 404, { resource: 'agent' });

    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('serializes status code to JSON', () => {
    const error = new ApiError('Rate limited', 'RATE_LIMITED', 429);
    const json = error.toJSON();

    expect(json.statusCode).toBe(429);
  });
});

describe('GatewayError', () => {
  it('creates gateway error for routing issues', () => {
    const error = new GatewayError('Tool not found', 'TOOL_NOT_FOUND', {
      toolName: 'unknown_tool',
    });

    expect(error.name).toBe('GatewayError');
    expect(error.code).toBe('TOOL_NOT_FOUND');
  });
});

describe('Type guards', () => {
  it('isAgentStoreError identifies base errors', () => {
    expect(isAgentStoreError(new AgentStoreError('test', 'TEST'))).toBe(true);
    expect(isAgentStoreError(new WalletError('test', 'WALLET_NOT_FOUND'))).toBe(true);
    expect(isAgentStoreError(new Error('test'))).toBe(false);
    expect(isAgentStoreError('string')).toBe(false);
    expect(isAgentStoreError(null)).toBe(false);
  });

  it('isWalletError only matches WalletError', () => {
    expect(isWalletError(new WalletError('test', 'WALLET_LOCKED'))).toBe(true);
    expect(isWalletError(new AgentStoreError('test', 'TEST'))).toBe(false);
    expect(isWalletError(new PaymentError('test', 'PAYMENT_REQUIRED'))).toBe(false);
  });

  it('isPaymentError only matches PaymentError', () => {
    expect(isPaymentError(new PaymentError('test', 'INVALID_AUTHORIZATION'))).toBe(true);
    expect(isPaymentError(new WalletError('test', 'WALLET_LOCKED'))).toBe(false);
  });

  it('isValidationError only matches ValidationError', () => {
    expect(isValidationError(new ValidationError('test'))).toBe(true);
    expect(isValidationError(new ApiError('test', 'NOT_FOUND', 404))).toBe(false);
  });

  it('isApiError only matches ApiError', () => {
    expect(isApiError(new ApiError('test', 'UNAUTHORIZED', 401))).toBe(true);
    expect(isApiError(new GatewayError('test', 'TOOL_NOT_FOUND'))).toBe(false);
  });

  it('isGatewayError only matches GatewayError', () => {
    expect(isGatewayError(new GatewayError('test', 'ENDPOINT_TIMEOUT'))).toBe(true);
    expect(isGatewayError(new ApiError('test', 'NOT_FOUND', 404))).toBe(false);
  });
});

describe('wrapError', () => {
  it('returns AgentStoreError unchanged', () => {
    const original = new WalletError('test', 'WALLET_LOCKED');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('wraps standard Error with context', () => {
    const original = new Error('Something broke');
    original.name = 'TypeError';
    const wrapped = wrapError(original);

    expect(wrapped instanceof AgentStoreError).toBe(true);
    expect(wrapped.message).toBe('Something broke');
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
    expect(wrapped.context?.originalName).toBe('TypeError');
  });

  it('wraps non-Error values', () => {
    const wrapped = wrapError('string error');

    expect(wrapped instanceof AgentStoreError).toBe(true);
    expect(wrapped.message).toBe('string error');
  });

  it('uses custom default code', () => {
    const wrapped = wrapError('test', 'CUSTOM_CODE');
    expect(wrapped.code).toBe('CUSTOM_CODE');
  });
});
