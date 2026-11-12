/// <reference types="vite/client" />

/** package.json "version", injected by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string;

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
