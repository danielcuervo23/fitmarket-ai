/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** "true" shows the unfinished AI chat screen; anything else hides it. */
  readonly VITE_FEATURE_CHAT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
