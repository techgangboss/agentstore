// x402 Payment Protocol Types (inlined for standalone deployment)
// Gasless USDC payments via EIP-3009 transferWithAuthorization

export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
export const USDC_DECIMALS = 6;
export const CHAIN_ID = 1;

// Platform fee configuration
export const PLATFORM_WALLET = '0x71483B877c40eb2BF99230176947F5ec1c2351cb' as const;
export const PLATFORM_FEE_PERCENT = 20; // 20% to platform, 80% to publisher

export interface X402PaymentRequired {
  amount: string;
  currency: 'USDC';
  payTo: string;
  resource: {
    type: 'agent' | 'tool_call';
    agent_id: string;
    description: string;
  };
  x402: {
    version: '1';
    chain_id: number;
    token: string;
    facilitator: string;
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
  };
  nonce: string;
  expires_at: string;
  // Fee breakdown
  fee_split: {
    platform_address: string;
    platform_amount: string;
    platform_percent: number;
    publisher_address: string;
    publisher_amount: string;
    publisher_percent: number;
  };
}

export interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  v: number;
  r: string;
  s: string;
}

export interface X402PaymentProof {
  tx_hash: string;
  block_number?: number;
  amount: string;
  currency: 'USDC';
  from: string;
  to: string;
  facilitator_signature?: string;
  status: 'pending' | 'preconfirmed' | 'confirmed';
  confirmations: number;
  timestamp: string;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createPaymentRequired(params: {
  amount: number;
  payTo: string;
  agentId: string;
  agentName: string;
  facilitatorEndpoint: string;
}): X402PaymentRequired {
  // Calculate fee split: 20% platform, 80% publisher
  const platformAmount = params.amount * (PLATFORM_FEE_PERCENT / 100);
  const publisherAmount = params.amount - platformAmount;

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
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    fee_split: {
      platform_address: PLATFORM_WALLET,
      platform_amount: platformAmount.toFixed(2),
      platform_percent: PLATFORM_FEE_PERCENT,
      publisher_address: params.payTo,
      publisher_amount: publisherAmount.toFixed(2),
      publisher_percent: 100 - PLATFORM_FEE_PERCENT,
    },
  };
}
