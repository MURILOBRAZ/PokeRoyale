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
  // Presentes de versão já recebidos (ids de GIFTS)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS gifts JSONB NOT NULL DEFAULT '[]'`,
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
  // Amigos (v1.0): um pedido por linha (quem pediu -> quem recebeu); aceito vira 'accepted'
  `CREATE TABLE IF NOT EXISTS friendships (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id)
  )`,
  'CREATE INDEX IF NOT EXISTS friendships_friend ON friendships (friend_id)',
  // Convite direto para X1: o anfitrião cria a sala e manda o código para o amigo
  `CREATE TABLE IF NOT EXISTS invites (
    id SERIAL PRIMARY KEY,
    from_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room TEXT NOT NULL,
    ranked BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS invites_to ON invites (to_id, created_at)',
  // Visto por último (online = nos últimos 45 s)
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ',
  // Histórico de partidas (v0.9): adversário, coroas, deck usado e arena
  'ALTER TABLE matches ADD COLUMN IF NOT EXISTS opponent TEXT',
  'ALTER TABLE matches ADD COLUMN IF NOT EXISTS crowns JSONB',
  'ALTER TABLE matches ADD COLUMN IF NOT EXISTS deck JSONB',
  'ALTER TABLE matches ADD COLUMN IF NOT EXISTS arena INT',
  'CREATE INDEX IF NOT EXISTS balls_user ON balls (user_id)',
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
  // Jornada com rotas (v0.10): as arenas 0..9 (Rota 1 + ginásios) viraram etapas 0..25 (rotas e ginásios).
  // Cada linha antiga (map_v 1) é convertida uma vez; linhas novas já nascem na versão 2.
  ...['users', 'balls', 'matches'].flatMap((t) => [
    `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS map_v INT NOT NULL DEFAULT 1`,
    `ALTER TABLE ${t} ALTER COLUMN map_v SET DEFAULT 2`,
    `UPDATE ${t} SET arena = (ARRAY[0, 2, 5, 8, 11, 14, 17, 20, 23, 25])[arena + 1], map_v = 2 WHERE map_v = 1`,
  ]),
  // Desafio do próximo ginásio em andamento (melhor de 3 contra o Líder)
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS gym_wins INT NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS gym_losses INT NOT NULL DEFAULT 0',
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
