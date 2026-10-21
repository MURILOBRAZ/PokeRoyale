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
let rivalName = ''; // nome do amigo no online (histórico de partidas)
let pendingInvite = null; // { id, name }: amigo desafiado, avisado assim que a sala for criada
let guestInfo = null; // deck/níveis que o convidado mandou (anfitrião guarda para a revanche)
let ranked = null; // { matchId, mode } quando a partida vale troféus (ver hub.js)
let lastRankedMode = null; // para o "Jogar de novo"
let endReward = null; // promessa com o texto do resultado registrado no servidor

// Estado da interface
const ui = { side: 0, selectedIndex: null, selected: null, hover: null, dragging: false };

// ---------- Telas ----------

function showScreen(id) {
  // Logado, Coleção, Arenas, Amigos, Treino e a sala viram abas dentro do início (com a barra e o menu);
  // só a recompensa abre por cima, como um destaque
  const tab = Account.loggedIn && TAB_SCREENS.includes(id);
  dockTabs(Account.loggedIn);
  const keepHub = tab || (Account.loggedIn && ['#reward', '#ranking', '#settings'].includes(id));
  for (const s of ['#loading', '#menu', '#lobby', '#end', '#deck', '#hub', '#auth', '#starter', '#road', '#reward', '#friends', '#ranking', '#settings', '#shop', '#safari', '#leave']) {
    $(s).classList.toggle('hidden', s !== id && !(keepHub && s === '#hub'));
  }
  $('.hub-main').classList.toggle('hidden', tab);
}

const TAB_SCREENS = ['#deck', '#road', '#friends', '#menu', '#lobby', '#shop', '#safari'];

// Move essas telas para dentro do início (logado) ou de volta para a página (sem conta)
function dockTabs(on) {
  const target = on ? $('#hub-content') : $('#app');
  for (const s of TAB_SCREENS) {
    const el = $(s);
    if (el.parentElement !== target) target.appendChild(el);
    el.classList.toggle('docked', on);
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
  // Cada coroa entra com um atraso, primeiro as suas e depois as do rival
  let delay = 0;
  const crown = (n) => (n ? Array.from({ length: n }, () => `<span class="crown" style="animation-delay:${(delay++ * 0.25 + 0.15).toFixed(2)}s">👑</span>`).join('') : '—');
  $('#end-crowns').innerHTML = `<span title="Você">${crown(game.crowns[mySide])}</span><span class="vs">x</span><span title="${rival}">${crown(game.crowns[1 - mySide])}</span>`;
  const won = !title && w === mySide;
  $('#end').classList.toggle('win', won);
  $('#end').querySelectorAll('.confetti').forEach((c) => c.remove());
  if (won) {
    const colors = ['#ffd84a', '#3b82f6', '#ef4444', '#4ade80', '#e9a6ff', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      c.addEventListener('animationend', () => c.remove());
      $('#end').appendChild(c);
    }
  }
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
  Sound.jingle(result);
  setTimeout(() => showEnd(title), title ? 0 : 1200);
}

// ---------- Partida ----------

// ---------- Emotes e visual na partida (cosméticos) ----------

const battleLook = { packs: ['emotes:pikachu', 'emotes:pikachu'], bubbles: [], lastSent: 0, crowns: [0, 0] };
const EMOTE_PACKS = Object.keys(COSMETICS).filter((id) => COSMETICS[id].kind === 'emotes');
const SKIN_IDS = Object.keys(COSMETICS).filter((id) => COSMETICS[id].kind === 'skin');

function myLook() {
  return Account.loggedIn && Account.user.look ? Account.user.look : DEFAULT_LOOK;
}

function validLook(look) {
  const ok = (id, kind) => COSMETICS[id] && COSMETICS[id].kind === kind;
  return {
    skin: look && ok(look.skin, 'skin') ? look.skin : 'skin:classico',
    emotes: look && ok(look.emotes, 'emotes') ? look.emotes : 'emotes:pikachu',
  };
}

function showEmote(side, mood) {
  if (!EMOTE_MOODS.some((m) => m.id === mood)) return;
  battleLook.bubbles = battleLook.bubbles.filter((b) => b.side !== side);
  battleLook.bubbles.push({ side, pack: battleLook.packs[side], mood, start: performance.now() });
}

function sendEmote(mood) {
  const now = performance.now();
  // Trocar de emote substitui o balão na hora; o intervalo mínimo só evita toque duplo sem querer
  if (!game || game.over || now - battleLook.lastSent < 400) return;
  battleLook.lastSent = now;
  showEmote(mySide, mood);
  if (net && (mode === 'host' || mode === 'guest')) net.send({ t: 'emote', mood });
}

function buildEmoteMenu() {
  const pack = battleLook.packs[mySide];
  $('#emote-menu').innerHTML = EMOTE_MOODS.map((m) => `<button data-mood="${m.id}" title="${m.name}"><img src="${emotePortraitUrl(pack, m.id)}" alt="${m.name}"></button>`).join('');
}

$('#emote-btn').addEventListener('click', () => $('#emote-menu').classList.toggle('hidden'));
$('#emote-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mood]');
  if (!b) return;
  sendEmote(b.dataset.mood);
  $('#emote-menu').classList.add('hidden');
});

// ---------- Sair da partida ----------
// Valendo troféus conta como derrota; online, o amigo vence; no treino só encerra.

function leaveWarning() {
  if (ranked) {
    const loss = TROPHIES[ranked.mode] ? TROPHIES[ranked.mode].loss : 0;
    return `A partida vale troféus: sair conta como <b>derrota</b> (${loss} 🏆).`;
  }
  if (mode === 'host' || mode === 'guest') return 'Seu amigo vence a partida e a sala é encerrada.';
  return 'A partida de treino será encerrada.';
}

$('#leave-btn').addEventListener('click', () => {
  if (!game || game.over) return;
  clearSelection();
  $('#emote-menu').classList.add('hidden');
  $('#leave-text').innerHTML = leaveWarning();
  $('#leave').classList.remove('hidden'); // a partida continua rodando por trás
});
$('#leave-cancel').addEventListener('click', () => $('#leave').classList.add('hidden'));
$('#leave-confirm').addEventListener('click', () => {
  $('#leave').classList.add('hidden');
  if (!game || game.over) return;
  game.over = true;
  game.winner = 1 - mySide; // desistência: o outro lado vence (registra derrota se valia troféus)
  const online = mode === 'host' || mode === 'guest';
  onMatchOver('Você saiu da partida');
  if (online) leaveOnline(); // o amigo recebe "Seu amigo saiu"
});

// ---------- Som ----------

function syncSoundUi() {
  $('#sound-btn').textContent = Sound.prefs.muted ? '🔇' : '🔊';
  $('#vol-music').value = Sound.prefs.music;
  $('#vol-sfx').value = Sound.prefs.sfx;
}
$('#sound-btn').addEventListener('click', () => {
  Sound.toggleMute();
  syncSoundUi();
});
$('#vol-music').addEventListener('input', (e) => Sound.set('music', Number(e.target.value)));
$('#vol-sfx').addEventListener('input', (e) => {
  Sound.set('sfx', Number(e.target.value));
  if (Sound.prefs.muted) {
    Sound.set('muted', false);
    syncSoundUi();
  }
});
syncSoundUi();

// O bot reage aos ginásios derrubados e ao fim da partida
function botReact(mood, chance = 1) {
  if (mode !== 'bot' || !game || Math.random() > chance) return;
  setTimeout(() => game && showEmote(1 - mySide, mood), 500 + Math.random() * 700);
}

function checkBotReactions() {
  if (mode !== 'bot') return;
  const [me, bot] = [game.crowns[mySide], game.crowns[1 - mySide]];
  if (bot > battleLook.crowns[1]) botReact('Happy', 0.8);
  if (me > battleLook.crowns[0]) botReact(Math.random() < 0.5 ? 'Angry' : 'Crying', 0.8);
  battleLook.crowns = [me, bot];
}

// opts: levels/trainers (níveis das cartas e dos ginásios), ranked (vale troféus), arena (visual),
// skins/packs (visual dos ginásios e emotes de cada lado)
function beginMatch(newMode, side, decks, opts = {}) {
  mode = newMode;
  mySide = side;
  ui.side = side;
  renderer.viewSide = side;
  renderer.setArena(opts.arena || 0);
  renderer.resize();
  const mine = validLook(myLook());
  const rivalPack = EMOTE_PACKS[Math.floor(Math.random() * EMOTE_PACKS.length)];
  const skins = opts.skins || (side === 0 ? [mine.skin, 'skin:classico'] : ['skin:classico', mine.skin]);
  battleLook.packs = opts.packs || (side === 0 ? [mine.emotes, rivalPack] : [rivalPack, mine.emotes]);
  battleLook.bubbles = [];
  battleLook.crowns = [0, 0];
  pendingInvite = null;
  game = new Game({ decks, levels: opts.levels, trainers: opts.trainers, skins, arena: opts.arena || 0 });
  document.body.classList.add('in-battle');
  // Gritos das cartas em jogo já começam a carregar; a música começa com a partida
  Sound.preloadCries(game.players.flatMap((p) => [...p.hand, ...p.queue]).map((id) => CARDS[id] && CARDS[id].dex));
  Sound.startMusic();
  buildEmoteMenu();
  $('#emote-menu').classList.add('hidden');
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
      if (pendingInvite) {
        const inv = pendingInvite;
        Account.api('invite-send', { to: inv.id, room: code, ranked: $('#hub-ranked').checked })
          .then(() => setLobbyStatus(`Esperando ${inv.name} aceitar o desafio`, true))
          .catch((err) => setLobbyStatus(err.message));
      }
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
          look: validLook(myLook()),
          name: Account.loggedIn ? Account.user.name : '',
        });
        setLobbyStatus('Conectado! Iniciando', true);
      }
    },
    onData(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'emote' && game) {
        showEmote(1 - mySide, msg.mood);
        return;
      }
      if (net.isHost) {
        if (msg.t === 'deploy' && game && mode === 'host') game.deploy(1, msg.i, msg.x, msg.y);
        if (msg.t === 'deck' && !game) {
          guestInfo = sanitizeGuest(msg);
          startOnlineAsHost();
        }
        return;
      }
      if (msg.t === 'start') {
        const skins = Array.isArray(msg.skins) ? msg.skins.map((id) => (SKIN_IDS.includes(id) ? id : 'skin:classico')) : undefined;
        const packs = Array.isArray(msg.packs) ? msg.packs.map((id) => (EMOTE_PACKS.includes(id) ? id : 'emotes:pikachu')) : undefined;
        rivalName = typeof msg.name === 'string' ? msg.name.slice(0, 16) : '';
        beginMatch('guest', 1, undefined, { arena: msg.arena, ranked: msg.ranked && Account.loggedIn ? { mode: 'online' } : null, skins, packs });
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
  const name = typeof msg.name === 'string' ? msg.name.slice(0, 16) : '';
  return { deck, levels, trainer, account: !!msg.account, look: validLook(msg.look), name };
}

function startOnlineAsHost() {
  const deck = myDeck();
  const g = guestInfo || { deck: [...DEFAULT_DECK], levels: {}, trainer: 1, account: false, look: validLook(null) };
  const mine = validLook(myLook());
  const skins = [mine.skin, g.look.skin];
  const packs = [mine.emotes, g.look.emotes];
  // Vale troféus só com os dois logados e a opção marcada; amistoso usa os stats base
  const isRanked = Account.loggedIn && g.account && $('#hub-ranked').checked;
  const arena = Account.loggedIn ? Account.user.arena : 0;
  beginMatch('host', 0, [deck, g.deck], isRanked
    ? { levels: [Account.levelsFor(deck), g.levels], trainers: [Account.user.level, g.trainer], ranked: { mode: 'online' }, arena, skins, packs }
    : { arena, skins, packs });
  net.send({ t: 'start', ranked: isRanked, arena, skins, packs, name: Account.loggedIn ? Account.user.name : '' });
  rivalName = g.name || '';
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
$('#btn-cancel').addEventListener('click', () => {
  if (pendingInvite) Account.api('invite-cancel', {}).catch(() => {});
  pendingInvite = null;
  showMenu();
});
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

// Últimos 10 s (do tempo normal ou da morte súbita): número grande no meio, relógio e bordas pulsando
let countdownShown = 0;
function updateCountdown() {
  const left = game.timeLeft;
  const final = !game.over && left > 0 && left <= 10;
  $('#timer-box').classList.toggle('final', final);
  $('#final-vignette').classList.toggle('hidden', !final);
  const el = $('#countdown');
  if (!final) {
    el.classList.add('hidden');
    countdownShown = 0;
    return;
  }
  const n = Math.ceil(left);
  if (n !== countdownShown) {
    countdownShown = n;
    el.textContent = n;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth; // reinicia a animação a cada número
    el.classList.add('pop');
  }
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
    // Pulinho quando a carta passa a caber na energia
    const affordable = missing === 0;
    if (affordable && el.dataset.affordable === '0') {
      el.classList.remove('ready');
      void el.offsetWidth;
      el.classList.add('ready');
    }
    el.dataset.affordable = affordable ? '1' : '0';
    el.classList.toggle('selected', ui.selectedIndex === i);
  });

  $('#energy-fill').style.width = `${(p.energy / MATCH.ENERGY_MAX) * 100}%`;
  $('#energy').classList.toggle('full', p.energy >= MATCH.ENERGY_MAX);
  $('#energy').classList.toggle('double', game.doubleEnergy);
  $('#energy-num').textContent = Math.floor(p.energy);

  const t = Math.ceil(game.timeLeft);
  $('#timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const box = $('#timer-box');
  box.classList.toggle('double', game.doubleEnergy);
  box.classList.toggle('overtime', game.overtime);
  $('#timer-label').textContent = game.overtime ? 'Morte súbita' : game.doubleEnergy ? 'Energia x2' : 'Tempo';
  updateCountdown();

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
  // Falhou: sem energia, a carta pisca em vermelho; local inválido, só treme
  const el = document.querySelectorAll('#hand .card')[i];
  if (el) {
    const noEnergy = game.players[mySide].energy < CARDS[game.players[mySide].hand[i]].cost;
    el.classList.remove('shake', 'denied');
    void el.offsetWidth;
    el.classList.add(noEnergy ? 'denied' : 'shake');
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

// ---------- Zoom no celular ----------
// O Safari do iPhone ignora "user-scalable=no": dois toques rápidos davam zoom e o jogador ficava preso
// vendo só um pedaço da tela. Arrastar e escolher cartas usam pointer events e não são afetados.
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  const quick = now - lastTouchEnd < 350;
  lastTouchEnd = now;
  if (quick && !e.target.closest('button, input, select, textarea, label, a')) e.preventDefault();
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
// Pinça para zoom só é bloqueada durante a partida
document.addEventListener('gesturestart', (e) => {
  if (game) e.preventDefault();
});

// Se a página ainda assim ficar com zoom durante a partida, volta à escala normal
const viewportMeta = document.querySelector('meta[name=viewport]');
const viewportContent = viewportMeta.content;
function resetZoom() {
  if (!game || !window.visualViewport || window.visualViewport.scale <= 1.01) return;
  // Trocar o conteúdo da meta tag faz o navegador recalcular a escala
  viewportMeta.content = `${viewportContent}, minimum-scale=1`;
  setTimeout(() => (viewportMeta.content = viewportContent), 60);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => setTimeout(resetZoom, 250));
}

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

  if (!game.over) checkBotReactions();
  if (game.over && !endShown) {
    if (mode === 'bot') botReact(game.winner === mySide ? 'Crying' : game.winner === -1 ? 'Surprised' : 'Happy');
    onMatchOver();
  }
}
setInterval(simulate, 1000 / 60);

function frame() {
  requestAnimationFrame(frame); // pede o próximo quadro antes: um erro aqui não congela a tela
  if (!game && document.body.classList.contains('in-battle')) document.body.classList.remove('in-battle');
  if (game) {
    if (ui.selectedIndex !== null) ui.selected = game.players[mySide].hand[ui.selectedIndex];
    updateHud();
  }
  battleLook.bubbles = battleLook.bubbles.filter((b) => performance.now() - b.start < 2400);
  $('#emote-btn').classList.toggle('hidden', !game || game.over);
  $('#leave-btn').classList.toggle('hidden', !game || game.over);
  $('#sound-btn').classList.toggle('hidden', !game || game.over);
  if (game) Sound.watch(game, mySide);
  // Fora da partida: tema do menu (começa depois do primeiro toque, quando o navegador libera o som)
  else if (Sound.ready && Sound.song !== 'menu') Sound.startMusic('menu');
  // Um erro de desenho não pode parar o laço (senão a tela congela inteira)
  try {
    renderer.draw(game || demoGame, game ? { ...ui, bubbles: battleLook.bubbles } : {});
  } catch (err) {
    console.error(err);
  }
}

// Arena vazia de fundo no menu (a tela inicial é escolhida em hub.js, depois de checar a conta)
const demoGame = new Game();
renderer.resize();
requestAnimationFrame(frame);
