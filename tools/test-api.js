// Teste automático da API com um Postgres em memória (PGlite). Não toca no banco real.
// Uso: node tools/test-api.js

const assert = require('assert');

async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  const sqlq = (text, params = []) => pg.query(text, params).then((r) => r.rows);
  require('../api/_lib/db').setDb(sqlq);
  const handler = require('../api/[action].js');
  const R = require('../api/_lib/rules');

  // Cliente falso: guarda o cookie de sessão como um navegador
  function client() {
    let cookie = '';
    return async function call(action, body, { method = 'POST', contentType = 'application/json' } = {}) {
      const headers = { 'content-type': contentType };
      if (cookie) headers.cookie = cookie;
      const req = { method, headers, query: { action }, body };
      let status = 0;
      let out = '';
      const resHeaders = {};
      const res = {
        set statusCode(v) { status = v; },
        get statusCode() { return status; },
        setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
        end(data) { out = data; },
      };
      await handler(req, res);
      const set = resHeaders['set-cookie'];
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return { status, data: JSON.parse(out), setCookie: set };
    };
  }

  let passed = 0;
  const ok = (name) => {
    passed++;
    console.log(`  ✔ ${name}`);
  };

  const a = client();
  // Conta
  let r = await a('signup', { email: 'ash@teste.local', password: 'pikachu1', name: 'Ash' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.setCookie, /HttpOnly/);
  assert.equal(r.data.user.name, 'Ash');
  assert.equal(r.data.user.starter, null);
  ok('cria conta e já entra (cookie httpOnly)');

  r = await a('signup', { email: 'ASH@teste.local', password: 'outra123', name: 'Ash2' });
  assert.equal(r.status, 409);
  ok('não deixa repetir e-mail (sem diferenciar maiúsculas)');

  assert.equal((await a('signup', { email: 'x', password: '123456', name: 'Xx1' })).status, 400);
  assert.equal((await a('signup', { email: 'b@b.co', password: '123', name: 'Bob' })).status, 400);
  assert.equal((await a('signup', { email: 'b@b.co', password: '123456', name: '<b>' })).status, 400);
  ok('valida e-mail, senha e nome');

  const row = await pg.query("SELECT pass_hash FROM users WHERE email = 'ash@teste.local'");
  assert.ok(row.rows[0].pass_hash.startsWith('scrypt$') && !row.rows[0].pass_hash.includes('pikachu1'));
  ok('senha guardada só como hash');

  // CSRF e método
  assert.equal((await a('deck', { deck: [] }, { contentType: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await a('deck', {}, { method: 'GET' })).status, 405);
  assert.equal((await a('nao-existe', {})).status, 404);
  ok('recusa formulários de outros sites, GET em ações e ações desconhecidas');

  // Inicial
  assert.equal((await a('match-start', { mode: 'bot' })).status, 409);
  r = await a('starter', { starter: 'charmander' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.user.deck, R.STARTERS.charmander.deck);
  assert.equal(Object.keys(r.data.collection).length, 8);
  assert.equal(r.data.collection.thunderbolt.level, 3); // golpe é raro: começa no nível 3
  assert.equal((await a('starter', { starter: 'squirtle' })).status, 409);
  ok('escolhe o inicial uma vez só e recebe o deck dele');

  // Deck só com cartas da coleção
  assert.equal((await a('deck', { deck: R.STARTERS.squirtle.deck })).status, 400);
  const swapped = [...R.STARTERS.charmander.deck.slice(1), 'charmander'];
  assert.equal((await a('deck', { deck: swapped })).status, 200);
  ok('deck aceita só cartas próprias');

  // Partida: curta demais não vale
  r = await a('match-start', { mode: 'bot' });
  assert.equal(r.status, 200);
  assert.ok(r.data.bot && r.data.bot.deck.length === 8);
  const m1 = r.data.matchId;
  assert.equal((await a('match-finish', { matchId: m1, result: 'win' })).status, 409);
  ok('partida curta demais não dá recompensa');

  // Vitória (finge que a partida durou 2 minutos)
  await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [m1]);
  r = await a('match-finish', { matchId: m1, result: 'win' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.delta, 20);
  assert.equal(r.data.trophies, 20);
  assert.ok(r.data.ball && R.BALLS[r.data.ball.tier]);
  assert.equal((await a('match-finish', { matchId: m1, result: 'win' })).status, 409);
  ok('vitória contra o bot: +20 troféus e uma ball; não conta duas vezes');

  // Derrota não cai abaixo de 0
  r = await a('match-start', { mode: 'bot' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'loss' });
  assert.equal(r.data.trophies, 10);
  ok('derrota: −10 troféus');

  // Sobe de arena e respeita o piso
  await pg.query("UPDATE users SET trophies = 295 WHERE email = 'ash@teste.local'");
  r = await a('match-start', { mode: 'online' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '3 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'win' });
  assert.equal(r.data.delta, 30);
  assert.equal(r.data.arena, 1);
  assert.equal(r.data.arenaUp, true);
  r = await a('match-start', { mode: 'online' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '3 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'loss' });
  assert.equal(r.data.trophies, 305); // 325 − 20
  for (let i = 0; i < 3; i++) {
    r = await a('match-start', { mode: 'online' });
    await pg.query(`UPDATE matches SET started_at = now() - interval '3 minutes' WHERE id = $1`, [r.data.matchId]);
    r = await a('match-finish', { matchId: r.data.matchId, result: 'loss' });
  }
  assert.equal(r.data.trophies, 300);
  ok('online +30/−20, sobe para o Ginásio de Pewter e não cai abaixo de 300');

  // Balls: só uma abrindo por vez, só abre quando pronta
  let st = (await a('me')).data;
  const balls = st.balls;
  assert.ok(balls.length >= 2, 'precisa de pelo menos 2 balls');
  assert.equal((await a('ball-open', { id: balls[0].id })).status, 409);
  assert.equal((await a('ball-unlock', { id: balls[0].id })).status, 200);
  assert.equal((await a('ball-unlock', { id: balls[1].id })).status, 409);
  assert.equal((await a('ball-open', { id: balls[0].id })).status, 409);
  await pg.query('UPDATE balls SET unlock_at = now() - interval \'1 second\' WHERE id = $1', [balls[0].id]);
  const goldBefore = (await a('me')).data.user.gold;
  r = await a('ball-open', { id: balls[0].id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const got = Object.values(r.data.contents.cards).reduce((x, y) => x + y, 0);
  assert.ok(got >= R.BALLS[r.data.tier].cards);
  assert.equal(r.data.state.user.gold, goldBefore + r.data.contents.gold);
  assert.equal((await a('ball-open', { id: balls[0].id })).status, 409);
  ok(`abre ${R.BALLS[r.data.tier].name} pronta: ${got} cartas + ${r.data.contents.gold} Pokédólares; não abre duas vezes`);

  // Limite de 4 espaços
  await pg.query(`INSERT INTO balls (user_id, tier, arena) SELECT id, 'premier', 0 FROM users, generate_series(1, 6) WHERE email = 'ash@teste.local'`);
  r = await a('match-start', { mode: 'bot' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'win' });
  assert.equal(r.data.ball, null);
  assert.equal(r.data.slotsFull, true);
  ok('com os 4 espaços cheios, a vitória não dá ball');

  // Poké Ball grátis: 1 disponível ao criar a conta, depois espera 4 h; acumula até 2
  r = await a('free-ball', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tier, 'poke');
  r = await a('free-ball', {});
  assert.equal(r.status, 409);
  assert.ok(r.data.nextAt);
  await pg.query(`UPDATE users SET free_ball_at = date_trunc('milliseconds', now() - interval '9 hours') WHERE email = 'ash@teste.local'`);
  assert.equal((await a('me')).data.user.freeBall.available, 2);
  assert.equal((await a('free-ball', {})).status, 200);
  assert.equal((await a('me')).data.user.freeBall.available, 1);
  assert.equal((await a('free-ball', {})).status, 200);
  assert.equal((await a('free-ball', {})).status, 409);
  ok('Poké Ball grátis a cada 4 h, acumulando até 2');

  // Melhorar carta
  await pg.query(`UPDATE collection SET copies = 0 WHERE card_id = 'charmander'`);
  assert.equal((await a('upgrade', { card: 'charmander' })).status, 409);
  await pg.query(`UPDATE collection SET copies = 5 WHERE card_id = 'charmander'`);
  await pg.query(`UPDATE users SET gold = 3`);
  r = await a('upgrade', { card: 'charmander' });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Pokédólares/);
  await pg.query(`UPDATE users SET gold = 100, xp = 0`);
  r = await a('upgrade', { card: 'charmander' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.collection.charmander.level, 2);
  assert.equal(r.data.state.collection.charmander.copies, 3);
  assert.equal(r.data.state.user.gold, 95);
  assert.equal(r.data.state.user.xp, 4);
  ok('melhora carta gastando cópias e Pokédólares (e dá XP)');

  // Itens
  await pg.query(`INSERT INTO user_items (user_id, item, qty) SELECT id, 'firestone', 1 FROM users WHERE email = 'ash@teste.local'`);
  assert.equal((await a('use-item', { item: 'firestone', card: 'zubat' })).status, 400); // zubat não é fogo
  r = await a('use-item', { item: 'firestone', card: 'charmander' });
  assert.equal(r.status, 200);
  assert.equal(r.data.copies, 4);
  assert.equal((await a('use-item', { item: 'firestone', card: 'charmander' })).status, 409);
  await pg.query(`INSERT INTO user_items (user_id, item, qty) SELECT id, 'rarecandy', 1 FROM users WHERE email = 'ash@teste.local'`);
  r = await a('use-item', { item: 'rarecandy', card: 'zubat' });
  assert.equal(r.status, 200);
  assert.equal(r.data.level, 2);
  ok('Pedra do Fogo vira cópia de carta de Fogo; Doce Raro sobe 1 nível');

  // Sessões e isolamento entre contas
  const b = client();
  assert.equal((await b('me')).data.user, null);
  assert.equal((await b('upgrade', { card: 'charmander' })).status, 401);
  assert.equal((await b('login', { email: 'ash@teste.local', password: 'errada' })).status, 401);
  r = await b('login', { email: 'Ash@Teste.local', password: 'pikachu1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.name, 'Ash');
  await b('logout', {});
  assert.equal((await b('me')).data.user, null);
  assert.equal((await a('me')).data.user.name, 'Ash'); // a outra sessão continua
  const c = client();
  await c('signup', { email: 'gary@teste.local', password: 'eevee123', name: 'Gary' });
  await c('starter', { starter: 'squirtle' });
  const someBall = (await a('me')).data.balls[0].id;
  assert.equal((await c('ball-unlock', { id: someBall })).status, 404);
  ok('login/logout, senha errada e uma conta não mexe nas balls da outra');

  // Ranking global
  await pg.query("UPDATE users SET trophies = 900, best_trophies = 900 WHERE email = 'gary@teste.local'");
  r = await a('ranking', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.top[0].name, 'Gary');
  assert.equal(r.data.top[0].rank, 1);
  assert.equal(r.data.top[1].name, 'Ash');
  assert.equal(r.data.top[1].me, true);
  assert.equal(r.data.top[0].me, false);
  assert.equal(r.data.me.rank, 2);
  assert.equal(r.data.total, 2);
  assert.ok(!JSON.stringify(r.data).includes('@'), 'o ranking não pode mostrar e-mails');
  assert.equal((await client()('ranking', {})).status, 401);
  ok('ranking global: ordem por troféus, sua posição e sem e-mails');

  // Configurações da conta
  assert.equal((await a('settings-name', { name: '<x>' })).status, 400);
  r = await a('settings-name', { name: 'Ash Ketchum' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.name, 'Ash Ketchum');
  const outro = client();
  await outro('login', { email: 'ash@teste.local', password: 'pikachu1' });
  assert.equal((await a('settings-password', { current: 'errada', password: 'novasenha' })).status, 401);
  assert.equal((await a('settings-password', { current: 'pikachu1', password: '123' })).status, 400);
  assert.equal((await a('settings-password', { current: 'pikachu1', password: 'novasenha' })).status, 200);
  assert.equal((await a('me')).data.user.name, 'Ash Ketchum'); // esta sessão continua
  assert.equal((await outro('me')).data.user, null); // a do outro aparelho caiu
  assert.equal((await client()('login', { email: 'ash@teste.local', password: 'pikachu1' })).status, 401);
  assert.equal((await client()('login', { email: 'ash@teste.local', password: 'novasenha' })).status, 200);
  ok('troca nome e senha (pede a atual e desconecta os outros aparelhos)');

  // Nome de treinador único (sem diferenciar maiúsculas)
  r = await client()('signup', { email: 'outro@teste.local', password: 'senha123', name: 'GARY' });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /nome de treinador já está em uso/);
  assert.equal((await a('settings-name', { name: 'gary' })).status, 409);
  assert.equal((await a('settings-name', { name: 'ash ketchum' })).status, 200); // o próprio nome com outra caixa pode
  await assert.rejects(pg.query("INSERT INTO users (email, name, pass_hash) VALUES ('x@teste.local', 'gArY', 'x')"));
  ok('nome de treinador único: cadastro, troca de nome e o próprio banco bloqueiam repetidos');

  // Limite de partidas por hora
  await pg.query(`INSERT INTO matches (id, user_id, mode) SELECT 'x' || g, u.id, 'bot' FROM users u, generate_series(1, 40) g WHERE u.email = 'gary@teste.local'`);
  assert.equal((await c('match-start', { mode: 'bot' })).status, 429);
  ok('limite de 40 partidas por hora');

  // Banco antigo com nomes repetidos: o mais antigo fica com o nome, os outros ganham sufixo
  const pg2 = new PGlite();
  const db = require('../api/_lib/db');
  const q2 = (text, params = []) => pg2.query(text, params).then((x) => x.rows);
  db.setDb(q2);
  await db.q('SELECT 1');
  await pg2.query('DROP INDEX users_name_unique');
  await pg2.query("INSERT INTO users (email, name, pass_hash) VALUES ('1@t.l', 'Red', 'x'), ('2@t.l', 'red', 'x'), ('3@t.l', 'RED', 'x'), ('4@t.l', 'Blue', 'x')");
  db.setDb(q2); // nova "instância" do servidor: roda o esquema de novo
  const names = (await db.q('SELECT name FROM users ORDER BY id')).map((x) => x.name);
  assert.deepEqual(names, ['Red', 'red_2', 'RED_3', 'Blue']);
  await assert.rejects(pg2.query("INSERT INTO users (email, name, pass_hash) VALUES ('5@t.l', 'red', 'x')"));
  ok('contas antigas com nome repetido são renomeadas e o índice único é criado');

  console.log(`\n${passed} testes passaram.`);
}

main().catch((err) => {
  console.error('\n✘ FALHOU:', err.message);
  console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
