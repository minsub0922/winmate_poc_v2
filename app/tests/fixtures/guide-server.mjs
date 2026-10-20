import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../web/node_modules/vite/dist/node/index.js';

export async function createGuideTestServer() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
  const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { guest: true, auth_enabled: false } };
  const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error',
    plugins: [{ name: 'readonly-guide-fixtures', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const data = url.pathname === '/api/bootstrap' ? bootstrap : url.pathname === '/api/spatial/library' ? read('spatial/library') : { code: 'guide_readonly_fixture' };
        response.statusCode = request.method !== 'GET' ? 405 : data.code ? 503 : 200;
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data));
      });
    } }], server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
  await server.listen();
  return { server, base: 'http://127.0.0.1:' + server.httpServer.address().port };
}
