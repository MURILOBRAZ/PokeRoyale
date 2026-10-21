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

  const one2 = (db, text, params) => db.query(text, params).then((x) => x.rows[0]);
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

  // Vários decks: salvar no espaço 3 passa a usar ele; trocar volta para o 1; espaço vazio não pode ser escolhido
  r = (await a('me')).data;
  assert.equal(r.user.decks.length, R.DECK_SLOTS);
  assert.deepEqual(r.user.decks[0], swapped);
  assert.equal(r.user.decks[1], null);
  const third = [...swapped].reverse();
  r = await a('deck', { deck: third, slot: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.deckIndex, 2);
  assert.deepEqual(r.data.user.deck, third);
  assert.deepEqual(r.data.user.decks[0], swapped);
  assert.equal((await a('deck-select', { slot: 1 })).status, 400);
  assert.equal((await a('deck-select', { slot: 9 })).status, 400);
  assert.equal((await a('deck', { deck: third, slot: 5 })).status, 400);
  r = await a('deck-select', { slot: 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.user.deck, swapped);
  assert.equal(r.data.user.deckIndex, 0);
  ok('vários decks salvos e troca do deck em uso');

  // Presente de versão: uma construção aleatória, uma vez só
  r = (await a('me')).data;
  assert.equal(r.user.pendingGift, 'v08-construcao');
  r = await a('gift', { id: 'v08-construcao' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const [giftCard] = Object.keys(r.data.contents.cards);
  assert.equal(R.CARDS[giftCard].kind, 'building');
  assert.ok(!R.CARDS[giftCard].legendary);
  assert.ok(r.data.state.collection[giftCard]);
  assert.equal(r.data.state.user.pendingGift, null);
  assert.equal((await a('gift', { id: 'v08-construcao' })).status, 409);
  assert.equal((await a('gift', { id: 'nada' })).status, 404);
  ok('presente da v0.8: uma construção, uma vez só');

  // Partida: curta demais não vale
  r = await a('match-start', { mode: 'bot' });
  assert.equal(r.status, 200);
  assert.ok(r.data.bot && r.data.bot.deck.length === 8);
  const m1 = r.data.matchId;
  assert.equal((await a('match-finish', { matchId: m1, result: 'win' })).status, 409);
  ok('partida curta demais não dá recompensa');

  // Desistir logo no começo conta como derrota (não dá para escapar saindo cedo)
  await pg.query("UPDATE users SET trophies = 50 WHERE email = 'ash@teste.local'");
  r = await a('match-start', { mode: 'bot' });
  r = await a('match-finish', { matchId: r.data.matchId, result: 'loss' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.delta, -10);
  await pg.query("UPDATE users SET trophies = 0 WHERE email = 'ash@teste.local'");
  ok('sair da partida logo no início conta como derrota');

  // Vitória (finge que a partida durou 2 minutos)
  await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [m1]);
  r = await a('match-finish', { matchId: m1, result: 'win', crowns: [2, 1], opponent: '<b>Gary</b>' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.delta, 25);
  assert.equal(r.data.trophies, 25);
  assert.ok(r.data.ball && R.BALLS[r.data.ball.tier]);
  assert.equal((await a('match-finish', { matchId: m1, result: 'win' })).status, 409);
  ok('vitória contra o bot: +25 troféus e uma ball; não conta duas vezes');

  // Histórico: a vitória aparece primeiro, com coroas, adversário (o bot, não o texto do cliente) e deck
  r = await a('history', {});
  assert.equal(r.status, 200);
  const last = r.data.matches[0];
  assert.equal(last.result, 'win');
  assert.deepEqual(last.crowns, [2, 1]);
  assert.equal(last.trophies, 25);
  assert.ok(/^Bot/.test(last.opponent), last.opponent);
  assert.equal(last.deck.length, 8);
  ok('histórico de partidas com coroas, adversário e deck');

  // Derrota não cai abaixo de 0
  r = await a('match-start', { mode: 'bot' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'loss' });
  assert.equal(r.data.trophies, 15);
  ok('derrota: −10 troféus');

  // Sequência de vitórias: +1 por vitória seguida; a derrota volta para a base
  const botMatch = async (result) => {
    const s = await a('match-start', { mode: 'bot' });
    await pg.query(`UPDATE matches SET started_at = now() - interval '2 minutes' WHERE id = $1`, [s.data.matchId]);
    return (await a('match-finish', { matchId: s.data.matchId, result })).data.delta;
  };
  assert.deepEqual([await botMatch('win'), await botMatch('win'), await botMatch('win')], [25, 26, 27]);
  assert.equal(await botMatch('loss'), -10);
  assert.equal(await botMatch('win'), 25);
  assert.equal(await botMatch('win'), 26);
  assert.equal(await botMatch('draw'), 0);
  assert.equal(await botMatch('win'), 25);
  await botMatch('loss');
  ok('sequência de vitórias: 25, 26, 27; derrota ou empate volta para 25');

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

  // Balls: várias abrindo ao mesmo tempo, só abre quando pronta
  let st = (await a('me')).data;
  const balls = st.balls;
  assert.ok(balls.length >= 2, 'precisa de pelo menos 2 balls');
  assert.equal((await a('ball-open', { id: balls[0].id })).status, 409);
  assert.equal((await a('ball-unlock', { id: balls[0].id })).status, 200);
  assert.equal((await a('ball-unlock', { id: balls[1].id })).status, 200); // a segunda também começa
  assert.equal((await a('ball-unlock', { id: balls[1].id })).status, 409); // mas não duas vezes
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

  // Amigos: pedido pelo nome, aceitar, online, convite para X1
  const ashName = (await a('me')).data.user.name;
  assert.equal((await a('friend-add', { name: 'NinguemAqui' })).status, 404);
  assert.equal((await a('friend-add', { name: ashName })).status, 400);
  r = await a('friend-add', { name: 'gary' }); // sem diferenciar maiúsculas
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, 'pending');
  assert.equal((await a('friend-add', { name: 'Gary' })).status, 409);
  assert.equal((await a('invite-send', { to: 1, room: 'PIKA42' })).status, 403); // ainda não são amigos
  r = await c('friends', {});
  assert.equal(r.data.incoming.length, 1);
  const ashFriendId = r.data.incoming[0].id;
  assert.equal((await c('social-poll', {})).data.requests, 1);
  assert.equal((await c('friend-respond', { id: ashFriendId, accept: true })).status, 200);
  r = await a('friends', {});
  assert.equal(r.data.friends.length, 1);
  assert.equal(r.data.friends[0].name, 'Gary');
  assert.equal(r.data.friends[0].online, true); // Gary chamou social-poll agora há pouco
  const garyId = r.data.friends[0].id;
  // Convite: Ash cria a sala e chama o Gary; Gary vê e aceita
  r = await a('invite-send', { to: garyId, room: 'pika-42', ranked: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await c('social-poll', {});
  assert.equal(r.data.invites.length, 1);
  assert.equal(r.data.invites[0].room, 'PIKA42');
  assert.equal(r.data.invites[0].from, ashName);
  r = await c('invite-respond', { id: r.data.invites[0].id, accept: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.room, 'PIKA42');
  assert.equal(r.data.ranked, true);
  assert.equal((await a('social-poll', {})).data.sent.status, 'accepted');
  assert.equal((await c('invite-respond', { id: 999999, accept: true })).status, 410);
  // Convite expirado não aparece nem pode ser aceito
  r = await a('invite-send', { to: garyId, room: 'ONIX77' });
  await pg.query(`UPDATE invites SET created_at = now() - interval '5 minutes' WHERE id = $1`, [r.data.id]);
  assert.equal((await c('social-poll', {})).data.invites.length, 0);
  assert.equal((await c('invite-respond', { id: r.data.id, accept: true })).status, 410);
  // Desfazer amizade
  assert.equal((await c('friend-remove', { id: ashFriendId })).status, 200);
  assert.equal((await a('friends', {})).data.friends.length, 0);
  assert.equal((await a('invite-send', { to: garyId, room: 'PIKA42' })).status, 403);
  ok('amigos: pedido, aceitar, online, convite para X1, expirar e desfazer');

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

  // PokéMart
  const ashId = (await pg.query("SELECT id FROM users WHERE email = 'ash@teste.local'")).rows[0].id;
  await pg.query('UPDATE users SET gold = 500, fichas = 0 WHERE id = $1', [ashId]);
  r = await a('shop', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const offers = Object.fromEntries(r.data.offers.map((o) => [o.id, o]));
  assert.ok(offers.gift && offers.gift.free && offers.great && offers.stone && offers.ultra && offers.candy);
  assert.equal(r.data.offers.filter((o) => o.kind === 'card').length, 6);
  assert.ok(r.data.offers.every((o) => o.kind !== 'card' || !R.CARDS[o.card].legendary), 'loja não vende lendário');
  const again = await a('shop', {});
  assert.deepEqual(again.data.offers.map((o) => o.card || o.id), r.data.offers.map((o) => o.card || o.id));
  ok('loja: 6 cartas (1 grátis) + Great Ball, pedra, Ultra Ball e Doce Raro; mesmas ofertas o dia todo');

  const copies = async (id) => ((await pg.query('SELECT copies FROM collection WHERE user_id = $1 AND card_id = $2', [ashId, id])).rows[0] || { copies: -1 }).copies;
  const giftBefore = await copies(offers.gift.card);
  r = await a('shop-buy', { offer: 'gift' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.user.gold, 500);
  assert.equal(await copies(offers.gift.card), giftBefore + R.SHOP.giftAmount);
  assert.equal((await a('shop-buy', { offer: 'gift' })).status, 409);
  ok('presente grátis: 5 cópias, uma vez por dia');

  const common = r.data.shop.offers.find((o) => o.kind === 'card' && !o.free && R.rarityOf(R.CARDS[o.card]) === 'common');
  r = await a('shop-buy', { offer: common.id });
  assert.equal(r.data.state.user.gold, 490); // 1ª cópia: 10
  r = await a('shop-buy', { offer: common.id });
  assert.equal(r.data.state.user.gold, 470); // 2ª: 20
  assert.equal(r.data.shop.offers.find((o) => o.id === common.id).price.gold, 30);
  ok('preço das cartas sobe a cada cópia comprada no dia (10, 20, 30...)');

  await pg.query('UPDATE users SET gold = 40 WHERE id = $1', [ashId]);
  r = await a('shop-buy', { offer: 'great' });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Pokédólares insuficientes/);
  assert.equal((await pg.query('SELECT gold FROM users WHERE id = $1', [ashId])).rows[0].gold, 40);
  await pg.query('UPDATE users SET gold = 1000 WHERE id = $1', [ashId]);
  r = await a('shop-buy', { offer: 'great' });
  assert.equal(r.status, 200);
  assert.equal(r.data.tier, 'great');
  assert.ok(Object.keys(r.data.contents.cards).length > 0);
  assert.equal((await a('shop-buy', { offer: 'great' })).status, 409);
  ok('Great Ball: sem saldo não cobra nada; com saldo abre na hora; 1 por dia');

  assert.equal((await a('shop-buy', { offer: 'ultra' })).status, 409); // sem fichas
  await pg.query('UPDATE users SET fichas = 200 WHERE id = $1', [ashId]);
  r = await a('shop-buy', { offer: 'ultra' });
  assert.equal(r.status, 200);
  assert.equal(r.data.state.user.fichas, 140);
  // Mesma semana, outro dia: continua esgotada
  const day = R.shopDayKey();
  const [weekStart, weekEnd] = R.shopWeekRange(day);
  const otherDay = day === weekEnd ? weekStart : day + 1;
  await pg.query("INSERT INTO shop_days (user_id, day_key, offers) SELECT user_id, $2, offers FROM shop_days WHERE user_id = $1 AND day_key = $3", [ashId, otherDay, day]);
  const weekly = await one2(pg, 'SELECT COALESCE(sum((bought->>\'ultra\')::int), 0)::int AS n FROM shop_days WHERE user_id = $1 AND day_key BETWEEN $2 AND $3', [ashId, weekStart, weekEnd]);
  assert.equal(weekly.n, 1);
  assert.equal((await a('shop-buy', { offer: 'ultra' })).status, 409);
  r = await a('shop-buy', { offer: 'candy' });
  assert.equal(r.status, 200);
  assert.equal(r.data.state.items.rarecandy >= 1, true);
  ok('Ultra Ball e Doce Raro com Fichas, 1 por semana cada');

  // Fichas por conquistas
  await pg.query('UPDATE users SET fichas = 0, trophies = 290, arena = 0, xp = 18 WHERE id = $1', [ashId]);
  await pg.query("UPDATE matches SET result = 'loss' WHERE user_id = $1", [ashId]);
  r = await a('match-start', { mode: 'online' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '3 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'win' });
  assert.equal(r.data.arenaUp, true);
  assert.equal(r.data.firstWin, true);
  assert.equal(r.data.levelUp, true); // 18 + 5 XP passa de 20
  assert.equal(r.data.fichas, R.FICHAS.arenaUp + R.FICHAS.firstWin + R.FICHAS.levelUp);
  assert.equal(r.data.state.user.fichas, 130);
  r = await a('match-start', { mode: 'online' });
  await pg.query(`UPDATE matches SET started_at = now() - interval '3 minutes' WHERE id = $1`, [r.data.matchId]);
  r = await a('match-finish', { matchId: r.data.matchId, result: 'win' });
  assert.equal(r.data.firstWin, false);
  assert.equal(r.data.fichas, 0);
  ok('Fichas: +100 arena nova, +20 nível de treinador, +10 só na 1ª vitória do dia');

  // Cosméticos
  await pg.query('UPDATE users SET fichas = 100, arena = 1 WHERE id = $1', [ashId]);
  r = await a('me');
  assert.equal(r.data.user.look.avatar, 'charmander'); // padrão: o inicial
  assert.equal(r.data.user.look.title, 'title:novato');
  assert.equal((await a('look', { title: 'title:rocket' })).status, 400); // não comprou
  assert.equal((await a('look', { title: 'title:mestre' })).status, 400); // precisa da Liga
  assert.equal((await a('look', { title: 'title:rochas' })).status, 200); // conquistado em Pewter
  assert.equal((await a('cosmetic-buy', { id: 'title:mestre' })).status, 400); // conquistado, não se compra
  r = await a('cosmetic-buy', { id: 'title:rocket' });
  assert.equal(r.status, 200);
  assert.equal(r.data.state.user.fichas, 0);
  assert.equal((await a('cosmetic-buy', { id: 'title:rocket' })).status, 409); // já tem
  assert.equal((await a('cosmetic-buy', { id: 'skin:dourado' })).status, 409); // sem fichas
  r = await a('look', { title: 'title:rocket', avatar: 'zubat', emotes: 'emotes:pikachu', skin: 'skin:classico' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.user.look.title, r.data.user.look.avatar], ['title:rocket', 'zubat']);
  assert.equal((await a('look', { avatar: 'mewtwo' })).status, 400); // não está na coleção
  r = await a('ranking', {});
  const meRow = r.data.top.find((p) => p.me);
  assert.deepEqual([meRow.avatar, meRow.title], ['zubat', 'title:rocket']);
  ok('cosméticos: grátis, conquistados por arena e comprados com Fichas; avatar só da coleção; aparecem no ranking');

  // Zona Safári
  await pg.query('UPDATE users SET gold = 50 WHERE id = $1', [ashId]);
  assert.equal((await a('safari-act', { action: 'ball' })).status, 409); // sem entrada
  assert.equal((await a('safari-start', {})).status, 409); // sem saldo
  await pg.query('UPDATE users SET gold = 500 WHERE id = $1', [ashId]);
  r = await a('safari-start', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.user.gold, 400);
  assert.equal(r.data.run.balls, R.SAFARI.balls);
  assert.equal((await a('safari-start', {})).status, 409); // 1 por dia
  assert.equal((await a('safari-act', { action: 'dançar' })).status, 400);
  let caughtTotal = 0;
  let run = r.data.run;
  for (let i = 0; i < 40 && !run.done; i++) {
    r = await a('safari-act', { action: 'ball' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    run = r.data.run;
    if (r.data.caught) caughtTotal++;
  }
  assert.equal(run.done, true);
  assert.equal(run.caught.length, caughtTotal);
  assert.ok(run.balls >= 0 && run.encounter <= R.SAFARI.encounters);
  assert.equal((await a('safari-act', { action: 'ball' })).status, 409); // acabou
  ok(`Zona Safári: entrada paga 1x por dia, 6 bolas, ${caughtTotal} capturado(s) nesta rodada, acaba e não reabre`);

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
