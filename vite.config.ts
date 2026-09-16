import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      // Ignore Visual Studio hidden system folders to prevent EBUSY locks
      ignored: ['**/.vs/**'],
    },
  },
});