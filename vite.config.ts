import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill process.env to prevent "process is not defined" error in browser
    'process.env': {
        API_KEY: process.env.API_KEY || ''
    }
  }
});