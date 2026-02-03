// @agentstore/common - x402 Payment Protocol Types
// Facilitator-ready payment abstraction for gasless USDC payments

// USDC contract on Ethereum mainnet
export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
export const USDC_DECIMALS = 6;

// Chain configuration
export const CHAIN_ID = 1; // Ethereum mainnet

/**
 * HTTP 402 Payment Required response
 * Returned by gateway when payment is needed
 */
export interface X402PaymentRequired {
  // Payment details
  amount: string; // Amount in USDC (human readable, e.g., "5.00")
  currency: 'USDC';
  recipient: string; // Publisher's payout address

  // Resource being purchased
  resource: {
    type: 'agent' | 'tool_call';
    agent_id: string;
    description: string;
  };

  // Payment methods accepted
  accepts: X402PaymentMethod[];

  // Nonce to prevent replay
  nonce: string;

  // Expiration for this payment request
  expires_at: string; // ISO timestamp
}

/**
 * Payment methods the gateway accepts
 */
export type X402PaymentMethod =
  | X402FacilitatorMethod
  | X402DirectTransferMethod;

export interface X402FacilitatorMethod {
  type: 'facilitator';
  endpoint: string; // URL to submit permit to
  chain_id: number;
  token: string; // USDC address
  // EIP-2612 permit parameters
  permit: {
    name: string; // "USD Coin"
    version: string; // "2"
    verifyingContract: string; // USDC address
  };
}

export interface X402DirectTransferMethod {
  type: 'direct_transfer';
  chain_id: number;
  token: string; // USDC address
  // For direct transfer, user pays gas
}

/**
 * EIP-2612 Permit signature
 * User signs this off-chain (no gas needed)
 */
export interface PermitSignature {
  owner: string;
  spender: string; // Facilitator contract
  value: string; // Amount in wei (USDC has 6 decimals)
  nonce: bigint;
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

/**
 * Payment request submitted to facilitator
 */
export interface X402PaymentRequest {
  // The 402 response we're fulfilling
  payment_required: X402PaymentRequired;

  // Permit signature for gasless approval
  permit: PermitSignature;

  // User's wallet address
  payer: string;
}

/**
 * Proof returned by facilitator after payment
 */
export interface X402PaymentProof {
  // Transaction details
  tx_hash: string;
  block_number?: number;

  // Payment verification
  amount: string;
  currency: 'USDC';
  from: string;
  to: string;

  // Facilitator signature proving payment was made
  // Gateway can verify this without hitting the chain
  facilitator_signature?: string;

  // Status
  status: 'pending' | 'preconfirmed' | 'confirmed';
  confirmations: number;

  // Timestamp
  timestamp: string;
}

/**
 * X-Payment header format
 * Included in retry request after payment
 */
export interface X402PaymentHeader {
  version: '1';
  proof: X402PaymentProof;
  nonce: string; // Must match the 402 response nonce
}

/**
 * Payment Provider Interface
 * Abstraction allowing different payment backends
 */
export interface PaymentProvider {
  /**
   * Get provider name
   */
  readonly name: string;

  /**
   * Check if provider is available/configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Execute payment based on 402 response
   * Returns proof to include in X-Payment header
   */
  pay(
    paymentRequired: X402PaymentRequired,
    signerAddress: string,
    signPermit: (permit: PermitMessage) => Promise<PermitSignature>
  ): Promise<X402PaymentProof>;
}

/**
 * EIP-712 typed data for permit signing
 */
export interface PermitMessage {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    Permit: Array<{ name: string; type: string }>;
  };
  primaryType: 'Permit';
  message: {
    owner: string;
    spender: string;
    value: string;
    nonce: bigint;
    deadline: bigint;
  };
}

/**
 * Entitlement granted after successful payment
 */
export interface X402Entitlement {
  token: string; // JWT or opaque token
  agent_id: string;
  wallet_address: string;
  expires_at: string | null;
  permissions: string[]; // tool names allowed
}

/**
 * Gateway verification request
 * Called to verify payment proof
 */
export interface VerifyPaymentRequest {
  payment_proof: X402PaymentProof;
  agent_id: string;
  wallet_address: string;
}

/**
 * Parse USDC amount to smallest unit (6 decimals)
 */
export function parseUSDC(amount: string | number): bigint {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return BigInt(Math.round(num * 10 ** USDC_DECIMALS));
}

/**
 * Format USDC from smallest unit to human readable
 */
export function formatUSDC(amount: bigint): string {
  const num = Number(amount) / 10 ** USDC_DECIMALS;
  return num.toFixed(2);
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create 402 Payment Required response
 */
export function createPaymentRequired(params: {
  amount: number;
  recipient: string;
  agentId: string;
  agentName: string;
  facilitatorEndpoint?: string;
}): X402PaymentRequired {
  const accepts: X402PaymentMethod[] = [];

  // Add facilitator method if endpoint provided
  if (params.facilitatorEndpoint) {
    accepts.push({
      type: 'facilitator',
      endpoint: params.facilitatorEndpoint,
      chain_id: CHAIN_ID,
      token: USDC_ADDRESS,
      permit: {
        name: 'USD Coin',
        version: '2',
        verifyingContract: USDC_ADDRESS,
      },
    });
  }

  // Always allow direct transfer as fallback
  accepts.push({
    type: 'direct_transfer',
    chain_id: CHAIN_ID,
    token: USDC_ADDRESS,
  });

  return {
    amount: params.amount.toFixed(2),
    currency: 'USDC',
    recipient: params.recipient,
    resource: {
      type: 'agent',
      agent_id: params.agentId,
      description: params.agentName,
    },
    accepts,
    nonce: generateNonce(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  };
}
