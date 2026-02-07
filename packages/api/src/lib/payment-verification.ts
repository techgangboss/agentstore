import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { mainnet } from 'viem/chains';

// mev-commit RPC endpoint for Ethereum mainnet
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

// Minimum confirmations required for final verification
const MIN_CONFIRMATIONS = 2;

// Time window for preconfirmation to be confirmed (5 minutes)
// Must be longer than the cron interval (1 minute) to avoid premature revocation
export const PRECONF_VERIFICATION_DEADLINE_MS = 5 * 60 * 1000;

// Create a public client for Ethereum mainnet via mev-commit
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

export type ConfirmationStatus = 'preconfirmed' | 'confirmed' | 'revoked';

export interface PaymentVerificationResult {
  valid: boolean;
  status: ConfirmationStatus;
  error?: string;
  txDetails?: {
    from: string;
    to: string;
    value: string;
    valueEth: string;
    blockNumber?: bigint;
    confirmations?: bigint;
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
 * Verify payment via mev-commit FastRPC preconfirmation
 *
 * mev-commit's eth_getTransactionReceipt returns a receipt once preconfirmation
 * commitments are obtained from providers - BEFORE the tx is on-chain.
 * This is the standard wallet flow for preconfirmations.
 *
 * @see https://docs.primev.xyz/v1.1.0/get-started/fastrpc
 */
export async function verifyPreconfirmation(
  params: VerifyPaymentParams
): Promise<PaymentVerificationResult> {
  const { txHash, expectedFrom, expectedTo, expectedAmountWei, slippageBps = 100 } = params;

  try {
    // On mev-commit RPC, getTransactionReceipt returns a receipt once preconfirmed
    // This happens BEFORE the tx is actually mined on-chain
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return {
        valid: false,
        status: 'revoked',
        error: 'Transaction not found or not yet preconfirmed'
      };
    }

    if (receipt.status !== 'success') {
      return { valid: false, status: 'revoked', error: 'Transaction failed' };
    }

    // Get transaction details to verify payment params
    const tx = await publicClient.getTransaction({ hash: txHash });

    if (!tx) {
      return { valid: false, status: 'revoked', error: 'Transaction details not found' };
    }

    // Verify sender address (case-insensitive)
    if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return {
        valid: false,
        status: 'revoked',
        error: `Sender mismatch: expected ${expectedFrom}, got ${tx.from}`,
      };
    }

    // Verify recipient address (case-insensitive)
    if (!tx.to || tx.to.toLowerCase() !== expectedTo.toLowerCase()) {
      return {
        valid: false,
        status: 'revoked',
        error: `Recipient mismatch: expected ${expectedTo}, got ${tx.to}`,
      };
    }

    // Verify amount with slippage tolerance
    const minAmount = expectedAmountWei - (expectedAmountWei * BigInt(slippageBps)) / BigInt(10000);

    if (tx.value < minAmount) {
      return {
        valid: false,
        status: 'revoked',
        error: `Insufficient payment: expected ${formatEther(expectedAmountWei)} ETH, got ${formatEther(tx.value)} ETH`,
      };
    }

    // Check confirmation depth
    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = currentBlock > receipt.blockNumber ? currentBlock - receipt.blockNumber : BigInt(0);

    // Receipt exists = preconfirmed (or confirmed if enough blocks)
    const status: ConfirmationStatus = confirmations >= MIN_CONFIRMATIONS ? 'confirmed' : 'preconfirmed';

    return {
      valid: true,
      status,
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
    console.error('Preconfirmation verification error:', error);
    return {
      valid: false,
      status: 'revoked',
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

/**
 * Verify final confirmation status (for background verification)
 * Used to confirm preconfirmed transactions or revoke if failed
 */
export async function verifyFinalConfirmation(
  txHash: `0x${string}`
): Promise<{ status: ConfirmationStatus; blockNumber?: bigint; confirmations?: bigint }> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      // Still pending - not yet confirmed
      return { status: 'preconfirmed' };
    }

    if (receipt.status !== 'success') {
      // Transaction failed on-chain
      return { status: 'revoked' };
    }

    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = currentBlock > receipt.blockNumber ? currentBlock - receipt.blockNumber : BigInt(0);

    if (confirmations >= MIN_CONFIRMATIONS) {
      return { status: 'confirmed', blockNumber: receipt.blockNumber, confirmations };
    }

    // Included but not enough confirmations yet
    return { status: 'preconfirmed', blockNumber: receipt.blockNumber, confirmations };
  } catch (error) {
    console.error('Final confirmation check error:', error);
    // On error, don't revoke - let caller decide
    return { status: 'preconfirmed' };
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
 * Cached ETH price to avoid excessive CoinGecko calls (rate limited at 10-30/min)
 */
let cachedEthPrice: { price: number; fetchedAt: number } | null = null;
const PRICE_CACHE_TTL = 60 * 1000; // 60 seconds

async function getEthPrice(): Promise<number> {
  const now = Date.now();
  if (cachedEthPrice && now - cachedEthPrice.fetchedAt < PRICE_CACHE_TTL) {
    return cachedEthPrice.price;
  }

  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  const data = (await response.json()) as { ethereum?: { usd?: number } };
  const ethPrice = data.ethereum?.usd;

  if (!ethPrice || ethPrice <= 0) {
    throw new Error('Invalid ETH price from oracle');
  }

  cachedEthPrice = { price: ethPrice, fetchedAt: now };
  return ethPrice;
}

/**
 * Convert USD price to ETH amount using a price oracle
 * For now, uses a simple API call - in production, use Chainlink or similar
 */
export async function usdToEth(usdAmount: number): Promise<bigint> {
  try {
    const ethPrice = await getEthPrice();
    const ethAmount = usdAmount / ethPrice;
    return parseEther(ethAmount.toFixed(18));
  } catch (error) {
    console.error('Price oracle error:', error);
    // Fallback: use last known good price, or $2000/ETH as last resort
    const fallbackPrice = cachedEthPrice?.price || 2000;
    const fallbackEthAmount = usdAmount / fallbackPrice;
    return parseEther(fallbackEthAmount.toFixed(18));
  }
}

