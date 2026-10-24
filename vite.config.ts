import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
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
