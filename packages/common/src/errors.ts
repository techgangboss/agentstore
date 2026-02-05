// @agentstore/common - Custom error classes for structured error handling

/**
 * Base error class for AgentStore errors.
 * All custom errors extend this for consistent handling.
 */
export class AgentStoreError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown> | undefined;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'AgentStoreError';
    this.code = code;
    this.context = context ?? undefined;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): { name: string; code: string; message: string; context: Record<string, unknown> | undefined } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Wallet-related errors (encryption, signing, balance)
 */
export class WalletError extends AgentStoreError {
  constructor(message: string, code: WalletErrorCode, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'WalletError';
  }
}

export type WalletErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_LOCKED'
  | 'WALLET_CORRUPTED'
  | 'INVALID_PASSWORD'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'SIGNING_FAILED'
  | 'INSUFFICIENT_BALANCE'
  | 'KEYCHAIN_ERROR';

/**
 * Payment-related errors (x402, authorizations, transactions)
 */
export class PaymentError extends AgentStoreError {
  constructor(message: string, code: PaymentErrorCode, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'PaymentError';
  }
}

export type PaymentErrorCode =
  | 'PAYMENT_REQUIRED'
  | 'INVALID_AUTHORIZATION'
  | 'AUTHORIZATION_EXPIRED'
  | 'TRANSACTION_FAILED'
  | 'TRANSACTION_TIMEOUT'
  | 'INVALID_AMOUNT'
  | 'INVALID_RECIPIENT'
  | 'SPEND_LIMIT_EXCEEDED';

/**
 * Validation errors (schemas, input validation)
 */
export class ValidationError extends AgentStoreError {
  public readonly field: string | undefined;
  public readonly issues: Array<{ path: string; message: string }> | undefined;

  constructor(
    message: string,
    options?: {
      field?: string;
      issues?: Array<{ path: string; message: string }>;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'VALIDATION_ERROR', options?.context);
    this.name = 'ValidationError';
    this.field = options?.field ?? undefined;
    this.issues = options?.issues ?? undefined;
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    context: Record<string, unknown> | undefined;
    field: string | undefined;
    issues: Array<{ path: string; message: string }> | undefined;
  } {
    return {
      ...super.toJSON(),
      field: this.field,
      issues: this.issues,
    };
  }
}

/**
 * API-related errors (rate limits, auth, not found)
 */
export class ApiError extends AgentStoreError {
  public readonly statusCode: number;

  constructor(
    message: string,
    code: ApiErrorCode,
    statusCode: number,
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    context: Record<string, unknown> | undefined;
    statusCode: number;
  } {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
    };
  }
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Gateway-related errors (routing, entitlements, proxy)
 */
export class GatewayError extends AgentStoreError {
  constructor(message: string, code: GatewayErrorCode, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'GatewayError';
  }
}

export type GatewayErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'ENTITLEMENT_REQUIRED'
  | 'ENTITLEMENT_EXPIRED'
  | 'ENDPOINT_TIMEOUT'
  | 'ENDPOINT_ERROR'
  | 'CONFIG_INVALID';

/**
 * Type guard to check if an error is an AgentStoreError
 */
export function isAgentStoreError(error: unknown): error is AgentStoreError {
  return error instanceof AgentStoreError;
}

/**
 * Type guards for specific error types
 */
export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
}

export function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

/**
 * Wrap an unknown error into an AgentStoreError
 */
export function wrapError(error: unknown, defaultCode = 'UNKNOWN_ERROR'): AgentStoreError {
  if (isAgentStoreError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentStoreError(error.message, defaultCode, {
      originalName: error.name,
      stack: error.stack,
    });
  }

  return new AgentStoreError(String(error), defaultCode);
}
