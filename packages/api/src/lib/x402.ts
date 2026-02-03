// x402 Payment Protocol Types (inlined for standalone deployment)

export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
export const USDC_DECIMALS = 6;
export const CHAIN_ID = 1;

export interface X402PaymentRequired {
  amount: string;
  currency: 'USDC';
  recipient: string;
  resource: {
    type: 'agent' | 'tool_call';
    agent_id: string;
    description: string;
  };
  accepts: X402PaymentMethod[];
  nonce: string;
  expires_at: string;
}

export type X402PaymentMethod =
  | X402FacilitatorMethod
  | X402DirectTransferMethod;

export interface X402FacilitatorMethod {
  type: 'facilitator';
  endpoint: string;
  chain_id: number;
  token: string;
  permit: {
    name: string;
    version: string;
    verifyingContract: string;
  };
}

export interface X402DirectTransferMethod {
  type: 'direct_transfer';
  chain_id: number;
  token: string;
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
  recipient: string;
  agentId: string;
  agentName: string;
  facilitatorEndpoint?: string;
}): X402PaymentRequired {
  const accepts: X402PaymentMethod[] = [];

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
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}
