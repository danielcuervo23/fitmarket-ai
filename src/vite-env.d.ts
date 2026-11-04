/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** "true" shows the unfinished AI chat screen; anything else hides it. */
  readonly VITE_FEATURE_CHAT?: string;
  /**
   * Base URL that auth e-mails (password reset) link back to. Optional:
   * defaults to the current site (window.location.origin).
   */
  readonly VITE_AUTH_REDIRECT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
