// Servidor de desenvolvimento: serve o jogo e a API (/api/<ação>) com um Postgres local (PGlite),
// sem precisar das credenciais do Neon. Os dados ficam em .devdb/ (ignorado pelo git).
// Uso: node tools/dev-server.js [porta=5173]   ·   --fresh apaga o banco local antes

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.argv.find((a) => /^\d+$/.test(a))) || 5173;
const dataDir = path.join(root, '.devdb');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function main() {
  if (process.argv.includes('--fresh')) fs.rmSync(dataDir, { recursive: true, force: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  require('../api/_lib/db').setDb((text, params) => pg.query(text, params).then((r) => r.rows));
  const handler = require('../api/[action].js');

  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const api = url.pathname.match(/^\/api\/([\w-]+)$/);
    if (api) {
      req.query = { action: api[1] };
      return handler(req, res);
    }
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    // Só arquivos do jogo: nada de pastas internas (código do servidor, ferramentas, ocultos)
    if (!file.startsWith(root) || /^[\\/](\.|node_modules|api|tools)([\\/]|$)/.test(file.slice(root.length))) {
      res.statusCode = 404;
      return res.end('not found');
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.statusCode = 404;
        return res.end('not found');
      }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    });
  }).listen(port, () => console.log(`PokéRoyale (dev) em http://localhost:${port} — banco local em .devdb/`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
