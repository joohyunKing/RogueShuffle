import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/RogueShuffle/' : '/',
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
  ],
});
