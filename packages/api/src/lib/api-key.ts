import { randomBytes, createHash } from 'crypto';
import { createAdminClient } from './supabase';

const API_KEY_PREFIX = 'ask_';

export function generateApiKey(): { key: string; hash: string } {
  const key = API_KEY_PREFIX + randomBytes(32).toString('hex');
  const hash = hashApiKey(key);
  return { key, hash };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Verify an X-API-Key header and return the publisher record.
 * Returns null if the key is missing or invalid.
 */
export async function verifyApiKey(
  request: Request
): Promise<{ id: string; publisher_id: string; payout_address: string } | null> {
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const hash = hashApiKey(apiKey);
  const supabase = createAdminClient();

  const { data: publisher, error } = await supabase
    .from('publishers')
    .select('id, publisher_id, payout_address')
    .eq('api_key_hash', hash)
    .single();

  if (error || !publisher) {
    return null;
  }

  return publisher;
}
