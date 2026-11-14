import { defineConfig } from "vite";
import { execFileSync } from 'node:child_process';
function baseCommit() { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } }
export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __ALBUM_BASE_COMMIT__: JSON.stringify(baseCommit()) },
  build: { target: 'es2022', rollupOptions: {
    input: mode === 'editor' ? { main: 'index.html', editor: 'editor.html', preview: 'album-preview.html' } : 'index.html',
    output: { manualChunks: { three: ["three"] } },
  } },
}));
