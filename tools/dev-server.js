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
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function main() {
  if (process.argv.includes('--fresh')) fs.rmSync(dataDir, { recursive: true, force: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  require('../api/_lib/db').setDb((text, params) => pg.query(text, params).then((r) => r.rows));
  const handler = require('../api/[action].js');

  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    // Só no desenvolvimento: dá uma ball pronta para abrir à conta logada (/__dev/ball?tier=master)
    if (url.pathname === '/__dev/ball') {
      const userId = await require('../api/_lib/auth').currentUserId(req);
      const tier = ['poke', 'premier', 'great', 'ultra', 'master'].includes(url.searchParams.get('tier')) ? url.searchParams.get('tier') : 'premier';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Entre na conta primeiro.' }));
      }
      const u = (await pg.query('SELECT arena, (SELECT count(*)::int FROM balls WHERE user_id = $1) AS n FROM users WHERE id = $1', [userId])).rows[0];
      if (u.n >= 4) await pg.query('DELETE FROM balls WHERE id = (SELECT min(id) FROM balls WHERE user_id = $1)', [userId]);
      await pg.query(`INSERT INTO balls (user_id, tier, arena, unlock_at) VALUES ($1, $2, $3, now() - interval '1 second')`, [userId, tier, u.arena]);
      return res.end(JSON.stringify({ ok: true, tier }));
    }
    // Só no desenvolvimento: dá Fichas e Pokédólares à conta logada (/__dev/saldo?fichas=200&gold=1000)
    if (url.pathname === '/__dev/saldo') {
      const userId = await require('../api/_lib/auth').currentUserId(req);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Entre na conta primeiro.' }));
      }
      const fichas = Number(url.searchParams.get('fichas')) || 0;
      const gold = Number(url.searchParams.get('gold')) || 0;
      await pg.query('UPDATE users SET fichas = fichas + $2, gold = gold + $3 WHERE id = $1', [userId, fichas, gold]);
      return res.end(JSON.stringify({ ok: true, fichas, gold }));
    }
    // Só no desenvolvimento: dá cartas à conta logada (/__dev/cartas?ids=pokecenter,mewtwolab ou ?ids=construcoes)
    if (url.pathname === '/__dev/cartas') {
      const userId = await require('../api/_lib/auth').currentUserId(req);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Entre na conta primeiro.' }));
      }
      const R = require('../api/_lib/rules');
      const asked = (url.searchParams.get('ids') || 'construcoes').split(',');
      const ids = asked.flatMap((id) => (id === 'construcoes'
        ? Object.keys(R.CARDS).filter((c) => R.CARDS[c].kind === 'building')
        : R.CARDS[id] ? [id] : []));
      for (const id of ids) {
        await pg.query(
          `INSERT INTO collection (user_id, card_id, level, copies) VALUES ($1, $2, $3, 0)
           ON CONFLICT (user_id, card_id) DO NOTHING`,
          [userId, id, R.startLevel(R.CARDS[id])],
        );
      }
      return res.end(JSON.stringify({ ok: true, ids }));
    }
    // Só no desenvolvimento: esquece os presentes de versão da conta logada, para ver de novo (/__dev/presente)
    if (url.pathname === '/__dev/presente') {
      const userId = await require('../api/_lib/auth').currentUserId(req);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Entre na conta primeiro.' }));
      }
      await pg.query(`UPDATE users SET gifts = '[]' WHERE id = $1`, [userId]);
      return res.end(JSON.stringify({ ok: true }));
    }
    // Só no desenvolvimento: entra na conta de teste (teste@teste.local / teste123), criando se preciso,
    // e enche Pokédólares e Fichas. Contra o bot, essa conta joga com energia infinita (ver js/main.js).
    if (url.pathname === '/__dev/conta-teste') {
      const R = require('../api/_lib/rules');
      const auth = require('../api/_lib/auth');
      let user = (await pg.query(`SELECT id FROM users WHERE email = 'teste@teste.local'`)).rows[0];
      if (!user) {
        const deck = R.STARTERS.charmander.deck;
        user = (await pg.query(
          `INSERT INTO users (email, name, pass_hash, starter, deck) VALUES ('teste@teste.local', 'Testador', $1, 'charmander', $2::jsonb) RETURNING id`,
          [auth.hashPassword('teste123'), JSON.stringify(deck)],
        )).rows[0];
        for (const id of deck) {
          await pg.query('INSERT INTO collection (user_id, card_id, level, copies) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING',
            [user.id, id, R.startLevel(R.CARDS[id])]);
        }
      }
      await pg.query('UPDATE users SET gold = 9999999, fichas = 999999 WHERE id = $1', [user.id]);
      await auth.createSession(res, user.id);
      res.statusCode = 302;
      res.setHeader('Location', '/');
      return res.end();
    }
    // Só no desenvolvimento: cria treinadores de mentira para testar o ranking (/__dev/treinadores?n=15)
    if (url.pathname === '/__dev/treinadores') {
      const n = Math.min(200, Number(url.searchParams.get('n')) || 15);
      const names = ['Gary', 'Misty', 'Brock', 'Red', 'Blue', 'Leaf', 'Ethan', 'Lyra', 'Dawn', 'Lucas', 'Serena', 'Calem', 'Hilda', 'Nate', 'Rosa', 'Elio', 'Gloria', 'Hop'];
      const starters = ['bulbasaur', 'charmander', 'squirtle'];
      for (let i = 0; i < n; i++) {
        const trophies = Math.floor(Math.random() * 3200);
        await pg.query(
          `INSERT INTO users (email, name, pass_hash, starter, trophies, best_trophies, arena, xp)
           VALUES ($1, $2, 'x', $3, $4, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [`bot${Date.now()}${i}@teste.local`, `${names[i % names.length]}${i >= names.length ? i : ''}`, starters[i % 3], trophies,
            [0, 300, 600, 1000, 1400, 1800, 2300, 2800, 3300, 4000].filter((t) => trophies >= t).length - 1, Math.floor(Math.random() * 3000)],
        );
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, criados: n }));
    }
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
