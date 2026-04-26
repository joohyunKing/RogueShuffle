import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  /*base: process.env.GITHUB_ACTIONS ? '/RogueShuffle/' : '/',*/
  base: "./",
  build: {
    chunkSizeWarningLimit: 1000, // 기준치를 1000kb(1MB)로 상향
  },
  plugins: [
    {
      name: 'serve-src-data',
      configureServer(server) {
        server.middlewares.use('/dev-data', (req, res, next) => {
          const filePath = path.resolve(__dirname, 'src/data', req.url.replace(/^\//, ''));
          if (fs.existsSync(filePath) && filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(fs.readFileSync(filePath, 'utf-8'));
          } else {
            next();
          }
        });
      },
    },
    {
      name: 'remove-dev-from-dist',
      apply: 'build',
      closeBundle() {
        const devPath = path.resolve(__dirname, 'dist/dev');
        if (fs.existsSync(devPath)) {
          fs.rmSync(devPath, { recursive: true, force: true });
          console.log('\n[Build] Excluded "dev" folder from dist.');
        }
      }
    }
  ],
});
