import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// CDP Client Key (Project ID) - set in Vercel environment
const CDP_CLIENT_KEY = process.env.CDP_CLIENT_KEY;

// Coinbase Onramp base URL
const ONRAMP_BASE_URL = 'https://pay.coinbase.com/buy/select-asset';

const SessionRequestSchema = z.object({
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount_usd: z.number().min(1).max(10000).optional(),
  asset: z.enum(['ETH', 'USDC']).default('USDC'),
});

// Build the onramp URL with appId
function buildOnrampUrl(
  appId: string,
  walletAddress: string,
  asset: string,
  amountUsd?: number
): string {
  const params = new URLSearchParams({
    appId,
    defaultAsset: asset,
    defaultNetwork: 'ethereum',
    addresses: JSON.stringify({
      [walletAddress]: ['ethereum'],
    }),
    assets: JSON.stringify([asset]),
  });

  // Add preset amount if specified
  if (amountUsd) {
    params.set('presetFiatAmount', amountUsd.toString());
    params.set('fiatCurrency', 'USD');
  }

  return `${ONRAMP_BASE_URL}?${params.toString()}`;
}

// POST /api/onramp/session - Generate onramp URL
export async function POST(request: NextRequest) {
  // Check if CDP client key is configured
  if (!CDP_CLIENT_KEY) {
    return NextResponse.json(
      {
        error: 'Fiat onramp not configured',
        message: 'CDP client key not set. Contact support or fund wallet manually.',
        manual_instructions: {
          step1: 'Go to any exchange (Coinbase, Kraken, etc.)',
          step2: 'Buy USDC with your credit card',
          step3: 'Send USDC to your AgentStore wallet address on Ethereum mainnet',
        },
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SessionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { wallet_address, amount_usd, asset } = parsed.data;

  try {
    // Build the onramp URL with appId
    const onrampUrl = buildOnrampUrl(CDP_CLIENT_KEY, wallet_address, asset, amount_usd);

    return NextResponse.json({
      success: true,
      onramp_url: onrampUrl,
      wallet_address,
      asset,
      amount_usd: amount_usd || null,
      instructions: [
        'Open the URL in your browser',
        'Complete the purchase with credit card or bank',
        `${asset} will be sent to your wallet within minutes`,
      ],
    });
  } catch (error) {
    console.error('Onramp URL generation error:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate onramp URL',
        message: error instanceof Error ? error.message : 'Unknown error',
        fallback: {
          message: 'You can manually fund your wallet:',
          step1: 'Go to coinbase.com or any exchange',
          step2: `Buy ${asset} and send to your wallet address`,
          wallet_address,
        },
      },
      { status: 500 }
    );
  }
}
