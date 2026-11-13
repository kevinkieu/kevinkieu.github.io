/* ==========================================================================
   Vite Configuration for Jarvis AI
   ========================================================================== */
import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Helper to get the correct asset paths for each chunk
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split('.').pop()
          if (/css/.test(assetInfo.name)) return 'css/[name].[hash][extname]'
          if (/\.(png|jpe?g|svg|gif|tiff?|webp|ico)$/i.test(assetInfo.name)) return 'assets/[name].[hash][extname]'
          if (/js/.test(assetInfo.name)) return 'js/[name].[hash].js'
          return 'assets/[name].[hash][extname]'
        },
        chunkFileNames: 'js/[name].[hash].js'
      }
    },
    // Enable esbuild minification for faster builds
    minify: 'esbuild',
    sourcemap: false
  },
  plugins: [
    // legacy plugin for older browser support if needed
    legacy()
  ],
  // Optimization settings
  optimizeDeps: {
    include: ['@google/genai']
  },
  // Server settings for development
  server: {
    open: true,
    port: 5173,
    strictPort: false
  },
  // Build output settings
  publicDir: 'public'
})