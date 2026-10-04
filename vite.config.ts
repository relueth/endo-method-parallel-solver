import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'recharts', 'lucide-react', 'motion'],
    },
    server: {
      // Cloudflare Tunnel や外部ドメインからのアクセスを許可
      allowedHosts: true as const,
      // 外部トンネル経由での不要な HMR WebSocket 接続エラーを無効化
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
