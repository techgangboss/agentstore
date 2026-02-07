import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton instances — Supabase JS clients are designed to be reused
let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function createClient() {
  if (!anonClient) {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_ANON_KEY!;
    anonClient = createSupabaseClient(supabaseUrl, supabaseKey);
  }
  return anonClient;
}

export function createAdminClient() {
  if (!adminClient) {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
    adminClient = createSupabaseClient(supabaseUrl, supabaseServiceKey);
  }
  return adminClient;
}
