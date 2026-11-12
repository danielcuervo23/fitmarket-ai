import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'


export default defineConfig({
  // The app version, sent to the server so it knows which answers this web
  // understands. package.json is the only place it is written.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Code shared with the Edge Functions (single source of truth)
      '@shared': path.resolve(__dirname, './supabase/functions/_shared'),
      'npm:zod@4.6.7': 'zod',
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Vendor code changes rarely: keeping it in its own files lets the
        // browser cache it across app releases.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/@supabase/')) return 'supabase'
          if (/\/(framer-motion|motion|motion-dom|motion-utils)\//.test(id)) {
            return 'motion'
          }
          if (/\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          return undefined
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
