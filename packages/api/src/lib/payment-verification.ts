import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { mainnet } from 'viem/chains';

// mev-commit RPC endpoint for Ethereum mainnet
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

// Minimum confirmations required for payment verification
const MIN_CONFIRMATIONS = 2;

// Create a public client for Ethereum mainnet via mev-commit
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

export interface PaymentVerificationResult {
  valid: boolean;
  error?: string;
  txDetails?: {
    from: string;
    to: string;
    value: string;
    valueEth: string;
    blockNumber: bigint;
    confirmations: bigint;
  };
}

export interface VerifyPaymentParams {
  txHash: `0x${string}`;
  expectedFrom: string;
  expectedTo: string;
  expectedAmountWei: bigint;
  // Allow 1% slippage for gas price variations
  slippageBps?: number;
}

/**
 * Verify an Ethereum payment transaction on mainnet via mev-commit RPC
 */
export async function verifyPayment(
  params: VerifyPaymentParams
): Promise<PaymentVerificationResult> {
  const { txHash, expectedFrom, expectedTo, expectedAmountWei, slippageBps = 100 } = params;

  try {
    // Fetch transaction
    const tx = await publicClient.getTransaction({ hash: txHash });

    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    // Fetch transaction receipt to confirm it succeeded
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return { valid: false, error: 'Transaction receipt not found - may be pending' };
    }

    if (receipt.status !== 'success') {
      return { valid: false, error: 'Transaction failed on-chain' };
    }

    // Get current block for confirmation count
    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;

    if (confirmations < MIN_CONFIRMATIONS) {
      return {
        valid: false,
        error: `Insufficient confirmations: ${confirmations}/${MIN_CONFIRMATIONS}`,
      };
    }

    // Verify sender address (case-insensitive)
    if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return {
        valid: false,
        error: `Sender mismatch: expected ${expectedFrom}, got ${tx.from}`,
      };
    }

    // Verify recipient address (case-insensitive)
    if (!tx.to || tx.to.toLowerCase() !== expectedTo.toLowerCase()) {
      return {
        valid: false,
        error: `Recipient mismatch: expected ${expectedTo}, got ${tx.to}`,
      };
    }

    // Verify amount with slippage tolerance
    const minAmount = expectedAmountWei - (expectedAmountWei * BigInt(slippageBps)) / BigInt(10000);
    const maxAmount = expectedAmountWei + (expectedAmountWei * BigInt(slippageBps)) / BigInt(10000);

    if (tx.value < minAmount) {
      return {
        valid: false,
        error: `Insufficient payment: expected ${formatEther(expectedAmountWei)} ETH, got ${formatEther(tx.value)} ETH`,
      };
    }

    if (tx.value > maxAmount) {
      // Overpayment is fine, just log it
      console.log(`Overpayment detected: expected ${formatEther(expectedAmountWei)} ETH, got ${formatEther(tx.value)} ETH`);
    }

    return {
      valid: true,
      txDetails: {
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        valueEth: formatEther(tx.value),
        blockNumber: receipt.blockNumber,
        confirmations,
      },
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

/**
 * Check if a transaction hash has already been used (replay protection)
 */
export async function isTransactionUsed(
  supabase: ReturnType<typeof import('./supabase').createClient>,
  txHash: string
): Promise<boolean> {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('tx_hash', txHash)
    .single();

  return !!data;
}

/**
 * Convert USD price to ETH amount using a price oracle
 * For now, uses a simple API call - in production, use Chainlink or similar
 */
export async function usdToEth(usdAmount: number): Promise<bigint> {
  try {
    // Fetch ETH price from CoinGecko (free, no API key)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    const data = await response.json();
    const ethPrice = data.ethereum.usd;

    if (!ethPrice || ethPrice <= 0) {
      throw new Error('Invalid ETH price from oracle');
    }

    // Convert USD to ETH (with 18 decimal precision)
    const ethAmount = usdAmount / ethPrice;
    return parseEther(ethAmount.toFixed(18));
  } catch (error) {
    console.error('Price oracle error:', error);
    // Fallback: assume $2000/ETH (will be rejected if wrong)
    const fallbackEthAmount = usdAmount / 2000;
    return parseEther(fallbackEthAmount.toFixed(18));
  }
}

/**
 * Get the platform fee wallet address
 */
export function getPlatformFeeAddress(): string {
  return process.env.PLATFORM_FEE_ADDRESS || '0x0000000000000000000000000000000000000000';
}
