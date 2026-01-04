import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SignJWT, importPKCS8 } from 'jose';
import crypto from 'crypto';

// CDP API credentials (set in Vercel environment)
const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME;
const CDP_API_KEY_PRIVATE_KEY = process.env.CDP_API_KEY_PRIVATE_KEY;

// Coinbase Onramp base URL
const ONRAMP_BASE_URL = 'https://pay.coinbase.com/buy/select-asset';
const CDP_API_BASE = 'https://api.developer.coinbase.com';

const SessionRequestSchema = z.object({
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount_usd: z.number().min(1).max(10000).optional(),
});

// Generate CDP JWT token for API authentication
async function generateCDPToken(): Promise<string> {
  if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
    throw new Error('CDP API credentials not configured');
  }

  const uri = `${CDP_API_BASE}/onramp/v1/token`;

  // Import the private key
  const privateKey = await importPKCS8(
    CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, '\n'),
    'ES256'
  );

  // Create JWT
  const jwt = await new SignJWT({
    sub: CDP_API_KEY_NAME,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [uri],
  })
    .setProtectedHeader({ alg: 'ES256', kid: CDP_API_KEY_NAME, typ: 'JWT', nonce: crypto.randomBytes(16).toString('hex') })
    .setIssuedAt()
    .setExpirationTime('2m')
    .setNotBefore(Math.floor(Date.now() / 1000))
    .sign(privateKey);

  return jwt;
}

// Get session token from Coinbase
async function getSessionToken(walletAddress: string): Promise<string> {
  const jwt = await generateCDPToken();

  const response = await fetch(`${CDP_API_BASE}/onramp/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      addresses: [
        {
          address: walletAddress,
          blockchains: ['ethereum'],
        },
      ],
      assets: ['ETH'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Coinbase session token error:', error);
    throw new Error(`Failed to get session token: ${response.status}`);
  }

  const data = await response.json() as { token: string };
  return data.token;
}

// Build the onramp URL with session token
function buildOnrampUrl(
  sessionToken: string,
  walletAddress: string,
  amountUsd?: number
): string {
  const params = new URLSearchParams({
    sessionToken,
    defaultAsset: 'ETH',
    defaultNetwork: 'ethereum',
    destinationWallets: JSON.stringify([
      {
        address: walletAddress,
        blockchains: ['ethereum'],
        assets: ['ETH'],
      },
    ]),
  });

  // Add preset amount if specified
  if (amountUsd) {
    params.set('presetFiatAmount', amountUsd.toString());
    params.set('fiatCurrency', 'USD');
  }

  return `${ONRAMP_BASE_URL}?${params.toString()}`;
}

// POST /api/onramp/session - Generate onramp URL with session token
export async function POST(request: NextRequest) {
  // Check if CDP credentials are configured
  if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
    return NextResponse.json(
      {
        error: 'Fiat onramp not configured',
        message: 'CDP API credentials not set. Contact support or fund wallet manually.',
        manual_instructions: {
          step1: 'Go to any exchange (Coinbase, Kraken, etc.)',
          step2: 'Buy ETH with your credit card',
          step3: 'Send ETH to your AgentStore wallet address',
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

  const { wallet_address, amount_usd } = parsed.data;

  try {
    // Get session token from Coinbase
    const sessionToken = await getSessionToken(wallet_address);

    // Build the onramp URL
    const onrampUrl = buildOnrampUrl(sessionToken, wallet_address, amount_usd);

    return NextResponse.json({
      success: true,
      onramp_url: onrampUrl,
      wallet_address,
      amount_usd: amount_usd || null,
      expires_in: 120, // Session tokens expire in ~2 minutes
      instructions: [
        'Open the URL in your browser',
        'Complete the purchase with credit card or bank',
        'ETH will be sent to your wallet within minutes',
      ],
    });
  } catch (error) {
    console.error('Onramp session error:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate onramp session',
        message: error instanceof Error ? error.message : 'Unknown error',
        fallback: {
          message: 'You can manually fund your wallet:',
          step1: 'Go to coinbase.com or any exchange',
          step2: 'Buy ETH and send to your wallet address',
          wallet_address,
        },
      },
      { status: 500 }
    );
  }
}
