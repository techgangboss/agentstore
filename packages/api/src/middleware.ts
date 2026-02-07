import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Check if Redis is configured
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis-based rate limiters (only created if Redis is configured)
let generalLimiter: Ratelimit | null = null;
let purchaseLimiter: Ratelimit | null = null;
let registrationLimiter: Ratelimit | null = null;

if (hasRedis) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  // General API: 60 requests per minute
  generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    analytics: true,
    prefix: 'agentstore:ratelimit:api',
  });

  // Purchase/payment endpoint: 10 requests per minute (stricter)
  purchaseLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: true,
    prefix: 'agentstore:ratelimit:purchase',
  });

  // Publisher registration: 3 requests per hour (very strict to prevent spam)
  registrationLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    analytics: true,
    prefix: 'agentstore:ratelimit:register',
  });
}

// Fallback in-memory rate limiting (for local dev or if Redis not configured)
const memoryRateLimit = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const REGISTRATION_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 60;
const MAX_PURCHASE_REQUESTS = 10;
const MAX_REGISTRATION_REQUESTS = 3;

function checkMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = RATE_LIMIT_WINDOW
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = memoryRateLimit.get(key);

  if (!entry || now > entry.resetAt) {
    memoryRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0]?.trim() || realIP || 'unknown';
}

// CORS headers applied to all API responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Wallet-Address, X-Payment',
};

// Maximum request body sizes (in bytes)
const MAX_BODY_SIZE = 1024 * 1024; // 1MB for general API
const MAX_AGENT_BODY_SIZE = 5 * 1024 * 1024; // 5MB for agent submissions (includes manifest)

// Routes that use purchase rate limiting
function isPaymentRoute(path: string): boolean {
  return path.startsWith('/api/purchase') || path.startsWith('/api/payments/submit');
}

export async function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const path = request.nextUrl.pathname;

  // Skip rate limiting for non-API routes
  if (!path.startsWith('/api')) {
    return NextResponse.next();
  }

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Check request body size for POST/PUT/PATCH requests
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const maxSize = path.includes('/publishers/agents') ? MAX_AGENT_BODY_SIZE : MAX_BODY_SIZE;

      if (size > maxSize) {
        return new NextResponse(
          JSON.stringify({
            error: 'Payload Too Large',
            message: `Request body exceeds maximum size of ${maxSize} bytes`,
          }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          }
        );
      }
    }
  }

  const isPayment = isPaymentRoute(path);
  const isRegistration = path === '/api/publishers' && request.method === 'POST';

  // Use Redis if available, otherwise fallback to memory
  if (hasRedis && generalLimiter && purchaseLimiter && registrationLimiter) {
    const limiter = isRegistration ? registrationLimiter : isPayment ? purchaseLimiter : generalLimiter;
    const { success, limit, remaining, reset } = await limiter.limit(ip);

    if (!success) {
      const resetIn = Math.max(0, reset - Date.now());
      return new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(reset / 1000).toString(),
            'Retry-After': Math.ceil(resetIn / 1000).toString(),
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil(reset / 1000).toString());
    // Add CORS headers to actual responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // Fallback to in-memory rate limiting
  const maxRequests = isRegistration
    ? MAX_REGISTRATION_REQUESTS
    : isPayment
      ? MAX_PURCHASE_REQUESTS
      : MAX_REQUESTS_PER_WINDOW;
  const windowMs = isRegistration ? REGISTRATION_WINDOW : RATE_LIMIT_WINDOW;
  const rateLimitKey = isRegistration ? `register:${ip}` : isPayment ? `purchase:${ip}` : `api:${ip}`;
  const { allowed, remaining, resetIn } = checkMemoryRateLimit(rateLimitKey, maxRequests, windowMs);

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
          ...CORS_HEADERS,
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetIn / 1000).toString(),
          'Retry-After': Math.ceil(resetIn / 1000).toString(),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetIn / 1000).toString());
  // Add CORS headers to actual responses
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
