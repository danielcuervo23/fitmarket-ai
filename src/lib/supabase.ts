import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to your .env file.`,
    );
  }
  return value;
}

const supabaseUrl = requireEnv(
  import.meta.env.VITE_SUPABASE_URL,
  'VITE_SUPABASE_URL',
);

const supabaseAnonKey = requireEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  'VITE_SUPABASE_ANON_KEY',
);

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
);
