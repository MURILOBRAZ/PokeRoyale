// Menus, entrada do jogador, multiplayer e loop principal.
//
// Modos:
//   'bot'   — partida local contra o computador (treino, ou valendo troféus com conta)
//   'host'  — anfitrião online: roda a simulação (lado 0) e envia snapshots
//   'guest' — convidado online: só desenha o estado recebido (lado 1) e envia jogadas

const $ = (sel) => document.querySelector(sel);

const SNAPSHOT_INTERVAL = 0.05; // 20x por segundo
const STEP = 1 / 60;

const canvas = $('#arena');
const renderer = new Renderer(canvas, 0);

let game = null;
let bot = null;
let net = null;
let mode = 'bot';
let mySide = 0;
let level = 'normal';
let endShown = false;
let roomCode = '';
let snapTimer = 0;
let guestInfo = null; // deck/níveis que o convidado mandou (anfitrião guarda para a revanche)
let ranked = null; // { matchId, mode } quando a partida vale troféus (ver hub.js)
let lastRankedMode = null; // para o "Jogar de novo"
let endReward = null; // promessa com o texto do resultado registrado no servidor

// Estado da interface
const ui = { side: 0, selectedIndex: null, selected: null, hover: null, dragging: false };

// ---------- Telas ----------

function showScreen(id) {
  for (const s of ['#loading', '#menu', '#lobby', '#end', '#deck', '#hub', '#auth', '#starter', '#road', '#reward']) {
    $(s).classList.toggle('hidden', s !== id);
  }
}

// Volta para o início (conta ou menu de treino) — ver showHome em hub.js
function showMenu(error = '') {
  showHome(error);
}

function setHomeError(text) {
  $('#menu-error').textContent = text;
  $('#hub-error').textContent = text;
}

function updateMenuDeck() {
  $('#menu-deck-avg').textContent = `(custo médio ${fmt(deckAverageCost(loadDeck()))})`;
}

const deckEditor = new DeckEditor(() => {
  if (deckEditor.account) return showHome();
  renderLanding();
  showScreen('#menu');
});
$('#btn-deck').addEventListener('click', () => {
  deckEditor.open({ account: false });
  showScreen('#deck');
});

function showEnd(title) {
  const w = game.winner;
  const rival = mode === 'bot' ? 'Bot' : 'Amigo';
  $('#end-title').textContent = title || (w === mySide ? 'Vitória! 🏆' : w === -1 ? 'Empate' : 'Derrota');
  const crown = (n) => '👑'.repeat(n) || '—';
  $('#end-crowns').innerHTML = `<span title="Você">${crown(game.crowns[mySide])}</span><span class="vs">x</span><span title="${rival}">${crown(game.crowns[1 - mySide])}</span>`;
  const again = $('#btn-again');
  const connected = net && net.conn;
  again.disabled = mode === 'guest' || ((mode === 'host') && !connected);
  again.textContent = mode === 'bot' ? (lastRankedMode ? 'Batalhar de novo' : 'Jogar de novo') : mode === 'host' ? 'Revanche' : 'Aguardando anfitrião…';
  again.style.display = mode !== 'bot' && !connected ? 'none' : '';
  const box = $('#end-reward');
  box.innerHTML = endReward ? '<div class="won-ball muted">Registrando resultado…</div>' : '';
  if (endReward) {
    endReward.then((html) => {
      box.innerHTML = html || '';
    });
  }
  showScreen('#end');
}

// Fim de partida: avisa o servidor (se valer troféus) e mostra a tela de fim
function onMatchOver(title) {
  if (endShown) return;
  endShown = true;
  clearSelection();
  lastRankedMode = ranked ? ranked.mode : null;
  const w = game.winner;
  const result = w === -1 ? 'draw' : w === mySide || w === null ? 'win' : 'loss';
  endReward = ranked ? finishRanked(result) : null;
  setTimeout(() => showEnd(title), title ? 0 : 1200);
}

// ---------- Partida ----------

// opts: levels/trainers (níveis das cartas e dos ginásios), ranked (vale troféus), arena (visual)
function beginMatch(newMode, side, decks, opts = {}) {
  mode = newMode;
  mySide = side;
  ui.side = side;
  renderer.viewSide = side;
  renderer.setArena(opts.arena || 0);
  renderer.resize();
  game = new Game({ decks, levels: opts.levels, trainers: opts.trainers });
  ranked = opts.ranked || null;
  endReward = null;
  bot = mode === 'bot' ? new Bot(game, 1 - side, level) : null;
  endShown = false;
  snapTimer = 0;
  accumulator = 0;
  clearSelection();
  handSignature = '';
  showScreen(null);
  showBanner(mode === 'bot' ? 'Batalha!' : ranked ? 'Batalha online valendo troféus!' : 'Batalha online!');
}

document.querySelectorAll('#menu [data-level]').forEach((b) =>
  b.addEventListener('click', () => {
    level = b.dataset.level;
    leaveOnline();
    beginMatch('bot', 0, [loadDeck(), randomDeck()], { arena: randomArena() });
  }));

$('#btn-again').addEventListener('click', () => {
  if (mode === 'bot' && lastRankedMode) startRankedBot();
  else if (mode === 'bot') beginMatch('bot', 0, [loadDeck(), randomDeck()], { arena: randomArena() });
  else if (mode === 'host' && net && net.conn) startOnlineAsHost();
});
$('#btn-menu').addEventListener('click', () => showMenu());

// ---------- Multiplayer ----------

function leaveOnline() {
  if (net) net.close();
  net = null;
}

function netHandlers() {
  return {
    onRoom(code) {
      roomCode = code;
      $('#lobby-code').textContent = formatCode(code);
      setLobbyStatus('Aguardando seu amigo entrar', true);
      $('#btn-copy').style.display = '';
    },
    onConnect() {
      if (net.isHost) {
        setLobbyStatus('Amigo conectado! Iniciando', true);
      } else {
        // O anfitrião começa a partida assim que recebe o deck do convidado
        const deck = myDeck();
        net.send({
          t: 'deck', deck,
          levels: Account.loggedIn ? Account.levelsFor(deck) : {},
          trainer: Account.loggedIn ? Account.user.level : 1,
          account: Account.loggedIn,
        });
        setLobbyStatus('Conectado! Iniciando', true);
      }
    },
    onData(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (net.isHost) {
        if (msg.t === 'deploy' && game && mode === 'host') game.deploy(1, msg.i, msg.x, msg.y);
        if (msg.t === 'deck' && !game) {
          guestInfo = sanitizeGuest(msg);
          startOnlineAsHost();
        }
        return;
      }
      if (msg.t === 'start') {
        beginMatch('guest', 1, undefined, { arena: msg.arena, ranked: msg.ranked && Account.loggedIn ? { mode: 'online' } : null });
        registerOnlineMatch();
      }
      else if (msg.t === 'snap' && game && mode === 'guest') {
        game.applySnapshot(msg.s);
        for (const ev of msg.ev || []) showBanner(ev.text);
      } else if (msg.t === 'full') showMenu('Essa sala já está cheia.');
    },
    onClose() {
      if (game && !game.over) {
        // Quem fica conta como vencedor (o servidor só aceita se a partida durou o mínimo)
        game.over = true;
        game.winner = null;
        onMatchOver(mode === 'host' ? 'Seu amigo saiu' : 'Conexão perdida');
      } else if (!game) {
        showMenu('A conexão foi encerrada.');
      } else if ($('#end').classList.contains('hidden') === false) {
        showEnd(); // atualiza os botões (sem revanche)
      }
    },
    onError(text) {
      showMenu(text);
    },
  };
}

function setLobbyStatus(text, waiting = false) {
  const el = $('#lobby-status');
  el.textContent = text;
  el.classList.toggle('waiting', waiting);
}

function hostRoom() {
  if (typeof Peer === 'undefined') return showMenu('Não foi possível carregar o multiplayer. Verifique a internet.');
  leaveOnline();
  net = new Net(netHandlers());
  $('#lobby-title').textContent = 'Sala criada';
  $('#lobby-code').textContent = '······';
  $('#btn-copy').style.display = 'none';
  setLobbyStatus('Conectando ao servidor', true);
  showScreen('#lobby');
  net.host();
}

function joinRoom(text) {
  const code = normalizeCode(text);
  if (code.length < 4) {
    setHomeError('Digite o código que seu amigo mandou.');
    return;
  }
  if (typeof Peer === 'undefined') return showMenu('Não foi possível carregar o multiplayer. Verifique a internet.');
  leaveOnline();
  net = new Net(netHandlers());
  $('#lobby-title').textContent = 'Entrando na sala';
  $('#lobby-code').textContent = formatCode(code);
  $('#btn-copy').style.display = 'none';
  setLobbyStatus('Conectando', true);
  showScreen('#lobby');
  net.join(code);
}

// No treino, o visual da arena é sorteado entre todos os mapas
function randomArena() {
  return Math.floor(Math.random() * ARENAS.length);
}

// Deck de quem está jogando: o da conta (se logado) ou o de treino
function myDeck() {
  return Account.loggedIn && Account.user.deck ? Account.user.deck : loadDeck();
}

// O anfitrião confere o que o convidado mandou (níveis fora do possível viram nível base)
function sanitizeGuest(msg) {
  const deck = isValidDeck(msg.deck) ? msg.deck : [...DEFAULT_DECK];
  const levels = {};
  for (const id of deck) {
    const lvl = Number(msg.levels && msg.levels[id]);
    if (Number.isInteger(lvl) && lvl >= startLevel(CARDS[id]) && lvl <= MAX_CARD_LEVEL) levels[id] = lvl;
  }
  const trainer = Number.isInteger(msg.trainer) ? Math.min(MAX_TRAINER_LEVEL, Math.max(1, msg.trainer)) : 1;
  return { deck, levels, trainer, account: !!msg.account };
}

function startOnlineAsHost() {
  const deck = myDeck();
  const g = guestInfo || { deck: [...DEFAULT_DECK], levels: {}, trainer: 1, account: false };
  // Vale troféus só com os dois logados e a opção marcada; amistoso usa os stats base
  const isRanked = Account.loggedIn && g.account && $('#hub-ranked').checked;
  const arena = Account.loggedIn ? Account.user.arena : 0;
  beginMatch('host', 0, [deck, g.deck], isRanked
    ? { levels: [Account.levelsFor(deck), g.levels], trainers: [Account.user.level, g.trainer], ranked: { mode: 'online' }, arena }
    : { arena });
  net.send({ t: 'start', ranked: isRanked, arena });
  registerOnlineMatch();
}

function inviteLink() {
  return `${location.origin}${location.pathname}?sala=${roomCode}`;
}

$('#btn-host').addEventListener('click', hostRoom);
$('#btn-join').addEventListener('click', () => joinRoom($('#join-code').value));
$('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom(e.target.value);
});
$('#btn-cancel').addEventListener('click', () => showMenu());
$('#btn-copy').addEventListener('click', async () => {
  const text = `Bora jogar PokéRoyale! Código da sala: ${formatCode(roomCode)}\n${inviteLink()}`;
  try {
    await navigator.clipboard.writeText(text);
    $('#btn-copy').textContent = 'Copiado! ✔';
  } catch {
    $('#btn-copy').textContent = 'Copie o código acima';
  }
  setTimeout(() => ($('#btn-copy').textContent = 'Copiar convite'), 2000);
});

// ---------- Banner ----------

let bannerTimer = null;
function showBanner(text) {
  const el = $('#banner');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- HUD ----------

let handSignature = '';

function cardHTML(id) {
  const c = CARDS[id];
  return `${cardImgTag(c)}<div class="cost">${c.cost}</div><div class="name">${c.name}</div><div class="lock"></div>`;
}

function buildHand() {
  const p = game.players[mySide];
  const hand = $('#hand');
  hand.innerHTML = '';
  p.hand.forEach((id, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.index = i;
    el.style.setProperty('--type', TYPE_COLORS[CARDS[id].type]);
    el.title = `${CARDS[id].name} (${TYPE_NAMES[CARDS[id].type]}) — ${CARDS[id].desc}`;
    el.innerHTML = cardHTML(id);
    el.addEventListener('pointerdown', onCardDown);
    hand.appendChild(el);
  });
  const nextId = game.nextCard(mySide);
  const next = $('#next');
  next.style.setProperty('--type', TYPE_COLORS[CARDS[nextId].type]);
  next.innerHTML = cardHTML(nextId);
}

function renderCrowns(el, n) {
  el.innerHTML = [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">👑</span>`).join('');
}

function updateHud() {
  const p = game.players[mySide];
  const sig = p.hand.join(',') + '|' + game.nextCard(mySide);
  if (sig !== handSignature) {
    handSignature = sig;
    buildHand();
  }
  document.querySelectorAll('#hand .card').forEach((el, i) => {
    const c = CARDS[p.hand[i]];
    const missing = Math.max(0, 1 - p.energy / c.cost);
    el.querySelector('.lock').style.height = `${missing * 100}%`;
    el.classList.toggle('selected', ui.selectedIndex === i);
  });

  $('#energy-fill').style.width = `${(p.energy / MATCH.ENERGY_MAX) * 100}%`;
  $('#energy-num').textContent = Math.floor(p.energy);

  const t = Math.ceil(game.timeLeft);
  $('#timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const box = $('#timer-box');
  box.classList.toggle('double', game.doubleEnergy);
  box.classList.toggle('overtime', game.overtime);
  $('#timer-label').textContent = game.overtime ? 'Morte súbita' : game.doubleEnergy ? 'Energia x2' : 'Tempo';

  renderCrowns($('#crowns-me'), game.crowns[mySide]);
  renderCrowns($('#crowns-enemy'), game.crowns[1 - mySide]);
}

// ---------- Entrada ----------

function selectCard(i) {
  if (!game || game.over) return;
  if (ui.selectedIndex === i) return clearSelection();
  ui.selectedIndex = i;
  ui.selected = game.players[mySide].hand[i];
}

function clearSelection() {
  ui.selectedIndex = null;
  ui.selected = null;
  ui.hover = null;
  ui.dragging = false;
}

function pointerToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
  const [x, y] = renderer.s2w(px, py);
  if (x < 0 || y < 0 || x > ARENA.W || y > ARENA.H) return null;
  return [x, y];
}

function tryDeploy() {
  if (ui.selectedIndex === null || !ui.hover) return;
  const [x, y] = ui.hover;
  const i = ui.selectedIndex;
  let ok;
  if (mode === 'guest') {
    // O anfitrião valida de novo; aqui só evita mandar jogada impossível
    ok = game.canDeploy(mySide, i, x, y);
    if (ok) net.send({ t: 'deploy', i, x, y });
  } else {
    ok = game.deploy(mySide, i, x, y);
  }
  if (ok) {
    clearSelection();
    return;
  }
  // Falhou: falta energia ou local inválido
  const el = document.querySelectorAll('#hand .card')[i];
  if (el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }
}

function onCardDown(e) {
  e.preventDefault();
  const i = Number(e.currentTarget.dataset.index);
  const wasSelected = ui.selectedIndex === i;
  selectCard(i);
  if (!wasSelected) ui.dragging = true;
}

canvas.addEventListener('pointerdown', (e) => {
  if (ui.selectedIndex === null) return;
  ui.hover = pointerToWorld(e);
  ui.dragging = true;
});

window.addEventListener('pointermove', (e) => {
  if (ui.selectedIndex === null) return;
  const w = pointerToWorld(e);
  // No mouse, a prévia segue o cursor; no toque, só enquanto arrasta
  if (w || ui.dragging) ui.hover = w;
});

window.addEventListener('pointerup', (e) => {
  if (!ui.dragging) return;
  ui.dragging = false;
  if (pointerToWorld(e)) tryDeploy();
  else if (e.pointerType !== 'mouse') ui.hover = null;
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['1', '2', '3', '4'].includes(e.key)) selectCard(Number(e.key) - 1);
  if (e.key === 'Escape') clearSelection();
});

// A barra de cartas muda de altura ao ser montada, então observa a área da arena
new ResizeObserver(() => renderer.resize()).observe($('#arena-wrap'));

// ---------- Loop ----------
// A simulação roda num setInterval com passo fixo, para o anfitrião continuar
// simulando mesmo com a aba em segundo plano (onde o requestAnimationFrame para).

let accumulator = 0;
let lastSim = performance.now();

function simulate() {
  const now = performance.now();
  const elapsed = Math.min(2, (now - lastSim) / 1000);
  lastSim = now;
  if (!game) return;

  if (mode === 'guest') {
    game.interpolate(elapsed);
  } else {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      game.update(STEP);
      if (bot) bot.update(STEP);
    }
    const events = game.events.splice(0);
    for (const ev of events) showBanner(ev.text);
    if (mode === 'host') {
      snapTimer -= elapsed;
      if (snapTimer <= 0 || events.length || game.over) {
        snapTimer = SNAPSHOT_INTERVAL;
        net.send({ t: 'snap', s: game.toSnapshot(), ev: events });
      }
    }
  }

  if (game.over && !endShown) onMatchOver();
}
setInterval(simulate, 1000 / 60);

function frame() {
  if (game) {
    if (ui.selectedIndex !== null) ui.selected = game.players[mySide].hand[ui.selectedIndex];
    updateHud();
  }
  renderer.draw(game || demoGame, game ? ui : {});
  requestAnimationFrame(frame);
}

// Arena vazia de fundo no menu (a tela inicial é escolhida em hub.js, depois de checar a conta)
const demoGame = new Game();
renderer.resize();
requestAnimationFrame(frame);
