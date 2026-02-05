// @agentstore/common - x402 Payment Protocol Types
// Gasless USDC payments via EIP-3009 transferWithAuthorization

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
  payTo: string; // Address to receive the payment

  // Resource being purchased
  resource: {
    type: 'agent' | 'tool_call';
    agent_id: string;
    description: string;
  };

  // x402 payment configuration
  x402: {
    version: '1';
    chain_id: number;
    token: string; // USDC address
    facilitator: string; // Facilitator API base URL
    // EIP-712 domain for signing transferWithAuthorization
    domain: {
      name: string; // "USD Coin"
      version: string; // "2"
      chainId: number;
      verifyingContract: string; // USDC address
    };
  };

  // Nonce to prevent replay
  nonce: string;

  // Expiration for this payment request
  expires_at: string; // ISO timestamp
}

/**
 * EIP-3009 TransferWithAuthorization signature
 * User signs this off-chain (no gas needed)
 * The relay wallet submits it on-chain, paying gas
 */
export interface TransferAuthorization {
  from: string; // Payer's address
  to: string; // Recipient's address (payTo)
  value: string; // Amount in smallest unit (USDC has 6 decimals)
  validAfter: string; // Unix timestamp (typically "0")
  validBefore: string; // Unix timestamp (expiry)
  nonce: string; // Random bytes32 nonce
  v: number;
  r: string;
  s: string;
}

/**
 * Payment submission sent to our API
 * Contains the signed authorization for the facilitator to relay
 */
export interface X402PaymentRequest {
  // The 402 response we're fulfilling
  payment_required: X402PaymentRequired;

  // EIP-3009 signed authorization
  authorization: TransferAuthorization;

  // User's wallet address
  payer: string;
}

/**
 * Proof returned by facilitator after settling payment
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

  // Facilitator attestation
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
    signAuthorization: (message: TransferAuthorizationMessage) => Promise<TransferAuthorization>
  ): Promise<X402PaymentProof>;
}

/**
 * EIP-712 typed data for TransferWithAuthorization signing
 */
export interface TransferAuthorizationMessage {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    TransferWithAuthorization: Array<{ name: string; type: string }>;
  };
  primaryType: 'TransferWithAuthorization';
  message: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
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
 * Generate a random nonce (hex string)
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random bytes32 nonce for EIP-3009
 */
export function generateAuthorizationNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create 402 Payment Required response
 */
export function createPaymentRequired(params: {
  amount: number;
  payTo: string;
  agentId: string;
  agentName: string;
  facilitatorEndpoint: string;
}): X402PaymentRequired {
  return {
    amount: params.amount.toFixed(2),
    currency: 'USDC',
    payTo: params.payTo,
    resource: {
      type: 'agent',
      agent_id: params.agentId,
      description: params.agentName,
    },
    x402: {
      version: '1',
      chain_id: CHAIN_ID,
      token: USDC_ADDRESS,
      facilitator: params.facilitatorEndpoint,
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: CHAIN_ID,
        verifyingContract: USDC_ADDRESS,
      },
    },
    nonce: generateNonce(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  };
}
