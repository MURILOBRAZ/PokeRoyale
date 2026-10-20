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
  // Nome de treinador único (sem diferenciar maiúsculas). Contas antigas com nome repetido:
  // a mais antiga fica com o nome, as outras ganham "_<número>" — sem isso o índice não seria criado.
  `UPDATE users u SET name = left(u.name, 16 - length('_' || u.id)) || '_' || u.id
   WHERE EXISTS (SELECT 1 FROM users o WHERE lower(o.name) = lower(u.name) AND o.id < u.id)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (lower(name))',
  // Vários decks salvos (como no Clash Royale): decks = lista de DECK_SLOTS (cada um, lista de cartas ou null);
  // deck_index = qual está em uso. A coluna deck continua sendo o deck em uso (é o que as partidas usam).
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS decks JSONB',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS deck_index INT NOT NULL DEFAULT 0',
  // Fichas do Game Corner: moeda rara, ganha só por conquistas
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS fichas INT NOT NULL DEFAULT 0',
  // Cosméticos: o que está equipado (look) e o que foi comprado
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS look JSONB NOT NULL DEFAULT '{}'`,
  `CREATE TABLE IF NOT EXISTS user_cosmetics (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cosmetic TEXT NOT NULL,
    PRIMARY KEY (user_id, cosmetic)
  )`,
  // Zona Safári: uma entrada por dia
  `CREATE TABLE IF NOT EXISTS safari_runs (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key INT NOT NULL,
    state JSONB NOT NULL,
    PRIMARY KEY (user_id, day_key)
  )`,
  // PokéMart: ofertas de cada jogador por dia (geradas uma vez) e quantas foram compradas
  `CREATE TABLE IF NOT EXISTS shop_days (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key INT NOT NULL,
    offers JSONB NOT NULL,
    bought JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, day_key)
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
