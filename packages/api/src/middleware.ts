import { NextResponse, type NextRequest } from 'next/server';

// Simple in-memory rate limiting (resets on cold start)
// For production, use Redis or Vercel KV
const rateLimit = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute
const MAX_PURCHASE_REQUESTS = 10; // 10 purchase attempts per minute

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0]?.trim() || realIP || 'unknown';
}

function checkRateLimit(
  key: string,
  maxRequests: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimit.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: maxRequests - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

export function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const path = request.nextUrl.pathname;

  // Skip rate limiting for non-API routes
  if (!path.startsWith('/api')) {
    return NextResponse.next();
  }

  // Different limits for different endpoints
  const isPurchase = path.startsWith('/api/purchase');
  const maxRequests = isPurchase ? MAX_PURCHASE_REQUESTS : MAX_REQUESTS_PER_WINDOW;
  const rateLimitKey = isPurchase ? `purchase:${ip}` : `api:${ip}`;

  const { allowed, remaining, resetIn } = checkRateLimit(rateLimitKey, maxRequests);

  // Create response headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', maxRequests.toString());
  headers.set('X-RateLimit-Remaining', remaining.toString());
  headers.set('X-RateLimit-Reset', Math.ceil(resetIn / 1000).toString());

  if (!allowed) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetIn / 1000).toString(),
          'Retry-After': Math.ceil(resetIn / 1000).toString(),
        },
      }
    );
  }

  // Continue with rate limit headers
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetIn / 1000).toString());

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
