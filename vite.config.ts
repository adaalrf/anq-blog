import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Fastify sends these files as they are, so text is compressed once, here, not on each request.
function precompress(): Plugin {
  return {
    name: 'precompress',
    apply: 'build',
    async closeBundle() {
      const root = resolve('dist/client');
      const files = await readdir(root, { recursive: true });
      for (const name of files.filter((file) => /\.(css|html|js|svg|txt)$/.test(file))) {
        const source = await readFile(join(root, name));
        await writeFile(join(root, `${name}.br`), brotliCompressSync(source));
        await writeFile(join(root, `${name}.gz`), gzipSync(source, { level: 9 }));
      }
    },
  };
}
export default defineConfig({
  plugins: [react(), precompress()],
  root: 'src/client',
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    port: 5175,
    strictPort: true,
    proxy: { '^/api/': 'http://127.0.0.1:8082' },
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/.local/**',
      ],
    },
  },
});
