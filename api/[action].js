// API do PokéRoyale: uma função da Vercel atende /api/<ação>.
// O servidor é a fonte da verdade para conta, coleção, troféus, Premier Balls e itens;
// o conteúdo das balls é sorteado aqui, nunca no navegador.

const crypto = require('crypto');
const { q, one } = require('./_lib/db');
const auth = require('./_lib/auth');
const R = require('./_lib/rules');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_TAKEN = 'Esse nome de treinador já está em uso. Escolha outro.';
const isUniqueViolation = (err) => err && err.code === '23505';

async function nameTaken(name, exceptUserId = 0) {
  return !!(await one('SELECT 1 FROM users WHERE lower(name) = lower($1) AND id <> $2', [name, exceptUserId]));
}

// ---------- Estado do jogador ----------

function freeBallInfo(readyAt, now) {
  const ready = new Date(readyAt).getTime();
  const t = new Date(now).getTime();
  if (t < ready) return { available: 0, nextAt: new Date(ready).toISOString() };
  const available = Math.min(R.FREE_BALL_MAX, 1 + Math.floor((t - ready) / (R.FREE_BALL_SECONDS * 1000)));
  const nextAt = available >= R.FREE_BALL_MAX ? null : new Date(ready + available * R.FREE_BALL_SECONDS * 1000).toISOString();
  return { available, nextAt };
}

async function loadState(userId) {
  const u = await one('SELECT *, now() AS server_now FROM users WHERE id = $1', [userId]);
  if (!u) fail(401, 'Sessão inválida. Entre de novo.');
  const [collection, items, balls] = await Promise.all([
    q('SELECT card_id, level, copies FROM collection WHERE user_id = $1', [userId]),
    q('SELECT item, qty FROM user_items WHERE user_id = $1 AND qty > 0', [userId]),
    q('SELECT id, tier, arena, unlock_at FROM balls WHERE user_id = $1 ORDER BY id', [userId]),
  ]);
  const now = new Date(u.server_now).getTime();
  return {
    serverNow: new Date(u.server_now).toISOString(),
    user: {
      name: u.name,
      email: u.email,
      starter: u.starter,
      trophies: u.trophies,
      bestTrophies: u.best_trophies,
      arena: u.arena,
      xp: u.xp,
      level: R.trainerLevel(u.xp),
      gold: u.gold,
      deck: u.deck,
      freeBall: freeBallInfo(u.free_ball_at, u.server_now),
    },
    collection: Object.fromEntries(collection.map((c) => [c.card_id, { level: c.level, copies: c.copies }])),
    items: Object.fromEntries(items.map((i) => [i.item, i.qty])),
    balls: balls.map((b) => {
      const at = b.unlock_at ? new Date(b.unlock_at).getTime() : null;
      return {
        id: b.id, tier: b.tier, arena: b.arena,
        status: at === null ? 'locked' : at <= now ? 'ready' : 'unlocking',
        unlockAt: at === null ? null : new Date(at).toISOString(),
      };
    }),
  };
}

async function requireUser(req) {
  const id = await auth.currentUserId(req);
  if (!id) fail(401, 'Entre na sua conta para continuar.');
  return id;
}

// Adiciona cartas, Pokédólares e itens; devolve quais cartas são novas
async function applyRewards(userId, contents) {
  const ids = Object.keys(contents.cards);
  const owned = ids.length
    ? (await q('SELECT card_id FROM collection WHERE user_id = $1 AND card_id = ANY($2)', [userId, ids])).map((r) => r.card_id)
    : [];
  if (ids.length) {
    const rows = ids.map((id) => ({ id, lvl: R.startLevel(R.CARDS[id]), n: contents.cards[id] }));
    // Carta nova: a 1ª cópia libera a carta, as demais contam para o próximo nível
    await q(
      `INSERT INTO collection (user_id, card_id, level, copies)
       SELECT $1, x.id, x.lvl, x.n - 1 FROM jsonb_to_recordset($2::jsonb) AS x(id text, lvl int, n int)
       ON CONFLICT (user_id, card_id) DO UPDATE SET copies = collection.copies + EXCLUDED.copies + 1`,
      [userId, JSON.stringify(rows)],
    );
  }
  if (contents.gold) await q('UPDATE users SET gold = gold + $2 WHERE id = $1', [userId, contents.gold]);
  const items = Object.entries(contents.items || {}).map(([item, n]) => ({ item, n }));
  if (items.length) {
    await q(
      `INSERT INTO user_items (user_id, item, qty)
       SELECT $1, x.item, x.n FROM jsonb_to_recordset($2::jsonb) AS x(item text, n int)
       ON CONFLICT (user_id, item) DO UPDATE SET qty = user_items.qty + EXCLUDED.qty`,
      [userId, JSON.stringify(items)],
    );
  }
  return ids.filter((id) => !owned.includes(id));
}

// ---------- Ações ----------

const ACTIONS = {
  async signup({ body, res }) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!EMAIL_RE.test(email) || email.length > 120) fail(400, 'E-mail inválido.');
    if (password.length < 6 || password.length > 72) fail(400, 'A senha precisa ter de 6 a 72 caracteres.');
    if (!R.TRAINER_NAME_RE.test(name)) fail(400, 'O nome de treinador precisa ter de 3 a 16 letras ou números.');
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) fail(409, 'Já existe uma conta com esse e-mail.');
    if (await nameTaken(name)) fail(409, NAME_TAKEN);
    let row;
    try {
      row = await one(
        'INSERT INTO users (email, name, pass_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
        [email, name, auth.hashPassword(password)],
      );
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, NAME_TAKEN); // alguém pegou o nome no mesmo instante
      throw err;
    }
    if (!row) fail(409, 'Já existe uma conta com esse e-mail.');
    await auth.createSession(res, row.id);
    return loadState(row.id);
  },

  async login({ body, res }) {
    const email = String(body.email || '').trim().toLowerCase();
    const row = await one('SELECT id, pass_hash FROM users WHERE email = $1', [email]);
    if (!row || !auth.verifyPassword(String(body.password || ''), row.pass_hash)) fail(401, 'E-mail ou senha incorretos.');
    await auth.createSession(res, row.id);
    return loadState(row.id);
  },

  async logout({ req, res }) {
    await auth.destroySession(req, res);
    return { ok: true };
  },

  async me({ req }) {
    const id = await auth.currentUserId(req);
    return id ? loadState(id) : { user: null };
  },

  async starter({ req, body }) {
    const userId = await requireUser(req);
    const starter = R.STARTERS[body.starter];
    if (!starter) fail(400, 'Inicial inválido.');
    const row = await one(
      'UPDATE users SET starter = $2, deck = $3::jsonb WHERE id = $1 AND starter IS NULL RETURNING id',
      [userId, body.starter, JSON.stringify(starter.deck)],
    );
    if (!row) fail(409, 'Você já escolheu seu inicial.');
    const rows = starter.deck.map((id) => ({ id, lvl: R.startLevel(R.CARDS[id]) }));
    await q(
      `INSERT INTO collection (user_id, card_id, level, copies)
       SELECT $1, x.id, x.lvl, 0 FROM jsonb_to_recordset($2::jsonb) AS x(id text, lvl int)
       ON CONFLICT DO NOTHING`,
      [userId, JSON.stringify(rows)],
    );
    return loadState(userId);
  },

  async deck({ req, body }) {
    const userId = await requireUser(req);
    const deck = body.deck;
    if (!R.isValidDeck(deck)) fail(400, 'O deck precisa ter 8 cartas diferentes.');
    const owned = await q('SELECT card_id FROM collection WHERE user_id = $1 AND card_id = ANY($2)', [userId, deck]);
    if (owned.length !== R.DECK_SIZE) fail(400, 'Você só pode usar cartas da sua coleção.');
    await q('UPDATE users SET deck = $2::jsonb WHERE id = $1', [userId, JSON.stringify(deck)]);
    return loadState(userId);
  },

  async 'match-start'({ req, body }) {
    const userId = await requireUser(req);
    const mode = body.mode === 'online' ? 'online' : 'bot';
    const recent = await one(
      `SELECT count(*)::int AS n FROM matches WHERE user_id = $1 AND started_at > now() - interval '1 hour'`,
      [userId],
    );
    if (recent.n >= R.MATCHES_PER_HOUR) fail(429, 'Muitas partidas na última hora. Descanse um pouco!');
    const u = await one('SELECT arena, starter FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const id = crypto.randomUUID();
    await q('INSERT INTO matches (id, user_id, mode) VALUES ($1, $2, $3)', [id, userId, mode]);
    return { matchId: id, bot: mode === 'bot' ? R.botProfile(u.arena) : null };
  },

  async 'match-finish'({ req, body }) {
    const userId = await requireUser(req);
    const result = ['win', 'loss', 'draw'].includes(body.result) ? body.result : null;
    if (!result) fail(400, 'Resultado inválido.');
    const match = await one(
      `UPDATE matches SET finished_at = now(), result = $3
       WHERE id = $1 AND user_id = $2 AND finished_at IS NULL
         AND started_at < now() - make_interval(secs => $4)
         AND started_at > now() - interval '20 minutes'
       RETURNING mode`,
      [String(body.matchId || ''), userId, result, R.MATCH_MIN_SECONDS],
    );
    if (!match) fail(409, 'Partida não registrada (muito curta, antiga ou já contada).');

    const u = await one('SELECT trophies, best_trophies, arena FROM users WHERE id = $1', [userId]);
    const floor = R.ARENAS[u.arena].trophies; // não cai abaixo do início da arena alcançada
    const trophies = Math.max(floor, u.trophies + R.TROPHIES[match.mode][result]);
    const delta = trophies - u.trophies;
    const arena = Math.max(u.arena, R.arenaForTrophies(trophies));
    await q(
      `UPDATE users SET trophies = $2, best_trophies = GREATEST(best_trophies, $2), arena = $3, xp = xp + $4 WHERE id = $1`,
      [userId, trophies, arena, result === 'win' ? 5 : 1],
    );
    await q('UPDATE matches SET trophies_delta = $2 WHERE id = $1', [body.matchId, delta]);

    let ball = null;
    let slotsFull = false;
    if (result === 'win') {
      const tier = R.rollBallTier();
      ball = await one(
        `INSERT INTO balls (user_id, tier, arena)
         SELECT $1, $2, $3 WHERE (SELECT count(*) FROM balls WHERE user_id = $1) < $4
         RETURNING id, tier`,
        [userId, tier, arena, R.BALL_SLOTS],
      );
      slotsFull = !ball;
    }
    return { delta, trophies, arena, arenaUp: arena > u.arena, ball, slotsFull, state: await loadState(userId) };
  },

  async 'ball-unlock'({ req, body }) {
    const userId = await requireUser(req);
    const b = await one('SELECT tier FROM balls WHERE id = $1 AND user_id = $2', [body.id, userId]);
    if (!b) fail(404, 'Ball não encontrada.');
    const row = await one(
      `UPDATE balls SET unlock_at = now() + make_interval(secs => $3)
       WHERE id = $1 AND user_id = $2 AND unlock_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM balls o WHERE o.user_id = $2 AND o.unlock_at > now())
       RETURNING id`,
      [body.id, userId, R.BALLS[b.tier].seconds],
    );
    if (!row) fail(409, 'Já tem uma ball abrindo. Espere ela terminar.');
    return loadState(userId);
  },

  async 'ball-open'({ req, body }) {
    const userId = await requireUser(req);
    const b = await one(
      'DELETE FROM balls WHERE id = $1 AND user_id = $2 AND unlock_at IS NOT NULL AND unlock_at <= now() RETURNING tier, arena',
      [body.id, userId],
    );
    if (!b) fail(409, 'Essa ball ainda não está pronta.');
    const contents = R.rollBallContents(b.tier, b.arena);
    const newCards = await applyRewards(userId, contents);
    return { tier: b.tier, contents, newCards, state: await loadState(userId) };
  },

  async 'free-ball'({ req }) {
    const userId = await requireUser(req);
    const u = await one('SELECT free_ball_at, arena, starter, now() AS server_now FROM users WHERE id = $1', [userId]);
    if (!u.starter) fail(409, 'Escolha seu inicial primeiro.');
    const info = freeBallInfo(u.free_ball_at, u.server_now);
    if (!info.available) fail(409, 'A Poké Ball grátis ainda não está disponível.', { nextAt: info.nextAt });
    // Fichas: com 2 acumuladas, sobra exatamente 1 depois de abrir
    const now = new Date(u.server_now).getTime();
    const base = info.available >= R.FREE_BALL_MAX ? now - R.FREE_BALL_SECONDS * 1000 : new Date(u.free_ball_at).getTime();
    const next = new Date(base + R.FREE_BALL_SECONDS * 1000).toISOString();
    const row = await one(
      'UPDATE users SET free_ball_at = $3 WHERE id = $1 AND free_ball_at = $2 RETURNING id',
      [userId, u.free_ball_at, next],
    );
    if (!row) fail(409, 'Tente de novo.');
    const contents = R.rollBallContents('poke', u.arena);
    const newCards = await applyRewards(userId, contents);
    return { tier: 'poke', contents, newCards, state: await loadState(userId) };
  },

  async upgrade({ req, body }) {
    const userId = await requireUser(req);
    const card = R.CARDS[body.card];
    if (!card) fail(400, 'Carta inválida.');
    const c = await one('SELECT level, copies FROM collection WHERE user_id = $1 AND card_id = $2', [userId, card.id]);
    if (!c) fail(400, 'Você ainda não tem essa carta.');
    const cost = R.upgradeCost(card, c.level);
    if (!cost) fail(400, 'Essa carta já está no nível máximo.');
    if (c.copies < cost.copies) fail(409, `Faltam ${cost.copies - c.copies} cópias.`);
    // Tudo numa instrução só: só melhora se ainda houver cópias e Pokédólares
    const row = await one(
      `WITH c AS (
         UPDATE collection SET level = level + 1, copies = copies - $3
         WHERE user_id = $1 AND card_id = $2 AND level = $4 AND copies >= $3
           AND (SELECT gold FROM users WHERE id = $1) >= $5
         RETURNING level
       ), u AS (
         UPDATE users SET gold = gold - $5, xp = xp + $6 WHERE id = $1 AND EXISTS (SELECT 1 FROM c) RETURNING gold
       )
       SELECT c.level, u.gold FROM c, u`,
      [userId, card.id, cost.copies, c.level, cost.gold, cost.xp],
    );
    if (!row) fail(409, 'Pokédólares insuficientes.');
    return { level: row.level, state: await loadState(userId) };
  },

  // Ranking global: os 100 com mais troféus (desempate: recorde, depois quem chegou antes) e a sua posição
  async ranking({ req }) {
    const userId = await requireUser(req);
    const rows = await q(
      `SELECT id, name, trophies, best_trophies, xp, arena, starter FROM users
       WHERE starter IS NOT NULL
       ORDER BY trophies DESC, best_trophies DESC, id ASC
       LIMIT 100`,
    );
    const u = await one('SELECT trophies, best_trophies FROM users WHERE id = $1', [userId]);
    const pos = await one(
      `SELECT count(*)::int + 1 AS rank FROM users
       WHERE starter IS NOT NULL
         AND (trophies > $2 OR (trophies = $2 AND (best_trophies > $3 OR (best_trophies = $3 AND id < $1))))`,
      [userId, u.trophies, u.best_trophies],
    );
    const total = await one('SELECT count(*)::int AS n FROM users WHERE starter IS NOT NULL');
    return {
      top: rows.map((r, i) => ({
        rank: i + 1, name: r.name, trophies: r.trophies, level: R.trainerLevel(r.xp),
        arena: r.arena, starter: r.starter, me: r.id === userId,
      })),
      me: { rank: pos.rank, trophies: u.trophies },
      total: total.n,
    };
  },

  async 'settings-name'({ req, body }) {
    const userId = await requireUser(req);
    const name = String(body.name || '').trim();
    if (!R.TRAINER_NAME_RE.test(name)) fail(400, 'O nome de treinador precisa ter de 3 a 16 letras ou números.');
    if (await nameTaken(name, userId)) fail(409, NAME_TAKEN);
    try {
      await q('UPDATE users SET name = $2 WHERE id = $1', [userId, name]);
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, NAME_TAKEN);
      throw err;
    }
    return loadState(userId);
  },

  async 'settings-password'({ req, body }) {
    const userId = await requireUser(req);
    const password = String(body.password || '');
    const row = await one('SELECT pass_hash FROM users WHERE id = $1', [userId]);
    if (!auth.verifyPassword(String(body.current || ''), row.pass_hash)) fail(401, 'A senha atual está incorreta.');
    if (password.length < 6 || password.length > 72) fail(400, 'A nova senha precisa ter de 6 a 72 caracteres.');
    await q('UPDATE users SET pass_hash = $2 WHERE id = $1', [userId, auth.hashPassword(password)]);
    await auth.destroyOtherSessions(req, userId);
    return { ok: true };
  },

  async 'use-item'({ req, body }) {
    const userId = await requireUser(req);
    const card = R.CARDS[body.card];
    const item = R.ITEMS[body.item] && body.item;
    if (!card || !item) fail(400, 'Item ou carta inválidos.');
    if (!R.itemFitsCard(item, card)) fail(400, 'Esse item não serve para essa carta.');
    const c = await one('SELECT level FROM collection WHERE user_id = $1 AND card_id = $2', [userId, card.id]);
    if (!c) fail(400, 'Você ainda não tem essa carta.');
    const candy = item === 'rarecandy';
    if (candy && c.level >= R.MAX_CARD_LEVEL) fail(400, 'Essa carta já está no nível máximo.');
    const row = await one(
      `WITH it AS (
         UPDATE user_items SET qty = qty - 1 WHERE user_id = $1 AND item = $3 AND qty > 0 RETURNING qty
       )
       UPDATE collection SET copies = copies + $4, level = level + $5
       WHERE user_id = $1 AND card_id = $2 AND EXISTS (SELECT 1 FROM it)
       RETURNING level, copies`,
      [userId, card.id, item, candy ? 0 : 1, candy ? 1 : 0],
    );
    if (!row) fail(409, 'Você não tem esse item.');
    if (candy) await q('UPDATE users SET xp = xp + $2 WHERE id = $1', [userId, R.upgradeCost(card, c.level).xp]);
    return { level: row.level, copies: row.copies, state: await loadState(userId) };
  },
};

// ---------- HTTP ----------

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) return send(res, 404, { error: 'Ação desconhecida.' });
  try {
    if (action !== 'me') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
      // Exigir JSON impede formulários de outros sites de disparar ações (CSRF)
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return send(res, 415, { error: 'Envie JSON.' });
      }
    }
    let body;
    try {
      body = action === 'me' ? {} : await readBody(req);
    } catch {
      return send(res, 400, { error: 'JSON inválido.' });
    }
    const result = await fn({ req, res, body: body || {} });
    return send(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...(err.extra || {}) });
    console.error(err);
    return send(res, 500, { error: 'Erro no servidor. Tente de novo.' });
  }
};
