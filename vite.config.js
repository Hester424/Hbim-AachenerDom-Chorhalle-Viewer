import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Hbim-AachenerDom-Chorhalle-Viewer/', 
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'ifc': ['web-ifc', 'web-ifc-three']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['web-ifc', 'web-ifc-three']
  },
  
  assetsInclude: ['**/*.ifc', '**/*.json', '**/*.wasm']
});