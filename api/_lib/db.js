// Acesso ao banco. Em produção: Neon (Postgres serverless) via DATABASE_URL, que a Vercel injeta.
// Em desenvolvimento, tools/dev-server.js troca por um Postgres local (PGlite) com setDb().

let client = null;
let schemaReady = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    starter TEXT,
    trophies INT NOT NULL DEFAULT 0,
    best_trophies INT NOT NULL DEFAULT 0,
    arena INT NOT NULL DEFAULT 0,
    xp INT NOT NULL DEFAULT 0,
    gold INT NOT NULL DEFAULT 0,
    deck JSONB,
    free_ball_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()), -- ms: comparado com valores vindos do JS
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS collection (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    level INT NOT NULL,
    copies INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, card_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_items (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    qty INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item)
  )`,
  `CREATE TABLE IF NOT EXISTS balls (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    arena INT NOT NULL,
    unlock_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    result TEXT,
    trophies_delta INT
  )`,
  'CREATE INDEX IF NOT EXISTS matches_user_started ON matches (user_id, started_at)',
  'CREATE INDEX IF NOT EXISTS balls_user ON balls (user_id)',
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
];

function setDb(queryFn) {
  client = queryFn;
  schemaReady = null;
}

function getClient() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada');
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(url);
    client = (text, params) => sql(text, params);
  }
  return client;
}

// Cria as tabelas na primeira consulta de cada instância (IF NOT EXISTS: seguro repetir)
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const run = getClient();
      for (const stmt of SCHEMA) await run(stmt, []);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function q(text, params = []) {
  await ensureSchema();
  return getClient()(text, params);
}

async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

module.exports = { q, one, setDb };
