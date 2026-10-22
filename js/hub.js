// Telas da conta: entrar/criar conta, escolha do inicial, início (troféus, Premier Balls),
// caminho dos troféus, abertura de balls e partidas que valem troféus.
// Usa funções do main.js (beginMatch, showScreen, hostRoom...) e o Account (account.js).

let hubBusy = false;
let gymSeriesOver = false; // a última partida do desafio do Líder fechou a melhor de 3

const fmtNum = (n) => Number(n).toLocaleString('pt-BR');
// Barra do topo: de 10 mil para cima (ou do limite pedido) vira "15.2k" (e "10.4M" a partir de 1 milhão)
// para caber no celular (o valor inteiro fica no title)
const fmtShort = (n, from = 10000) => {
  if (n >= 1e6) return `${Math.floor(n / 1e5) / 10}M`;
  return n >= from ? `${Math.floor(n / 100) / 10}k` : fmtNum(n);
};

function fmtDuration(secs) {
  secs = Math.max(0, Math.ceil(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ballImg = (tier, cls = '') => `<img class="${cls}" src="${itemIcon(BALLS[tier].icon)}" alt="${BALLS[tier].name}">`;

// ---------- Navegação ----------

function showHome(error = '') {
  leaveOnline();
  game = null;
  ranked = null;
  if (Account.loggedIn && !Account.user.starter) return showStarter();
  if (Account.loggedIn) {
    viewArena = Account.user.arena;
    setNav('home');
    renderHub();
    $('#hub-error').textContent = error;
    showScreen('#hub');
    // Atualiza em segundo plano (troféus/balls podem ter mudado em outra aba)
    Account.refresh().then(() => {
      if (!$('#hub').classList.contains('hidden') && Account.loggedIn) {
        renderHub();
        // Presente de versão primeiro; as novidades ficam para quando não houver presente
        if (Account.user.pendingGift) openPendingGift();
        else openNews();
        socialPoll();
      }
    });
    return;
  }
  renderLanding();
  $('#menu-error').textContent = error;
  showScreen('#menu');
}

function renderLanding() {
  const logged = Account.loggedIn;
  $('#menu-account').innerHTML = logged
    ? '' // logado, o Treino é uma aba: volta-se pelo menu
    : Account.available
      ? '<div class="btn-row"><button id="menu-login" class="primary">Entrar</button><button id="menu-signup">Criar conta</button></div><p class="sub small">Com uma conta você coleciona Pokémon, ganha Premier Balls e sobe pelos ginásios até a Liga.</p>'
      : '<p class="sub small">Contas indisponíveis neste endereço (servidor offline). O treino funciona normalmente.</p>';
  $('#menu-online').classList.toggle('hidden', logged);
  updateMenuDeck();
}

$('#menu-account').addEventListener('click', (e) => {
  if (e.target.id === 'menu-login') showAuth('login');
  if (e.target.id === 'menu-signup') showAuth('signup');
  if (e.target.id === 'menu-back') showHome();
});

// ---------- Entrar / criar conta ----------

let authMode = 'login';

function showAuth(modeName) {
  authMode = modeName;
  const signup = modeName === 'signup';
  $('#auth-title').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#auth-name').classList.toggle('hidden', !signup);
  $('#auth-name').required = signup;
  $('#auth-pass').autocomplete = signup ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#auth-switch').textContent = signup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
  $('#auth-error').textContent = '';
  showScreen('#auth');
  (signup ? $('#auth-name') : $('#auth-email')).focus();
}

$('#auth-switch').addEventListener('click', () => showAuth(authMode === 'login' ? 'signup' : 'login'));
$('#auth-back').addEventListener('click', () => showHome());
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (hubBusy) return;
  hubBusy = true;
  $('#auth-submit').disabled = true;
  $('#auth-error').textContent = '';
  try {
    const body = { email: $('#auth-email').value, password: $('#auth-pass').value };
    if (authMode === 'signup') body.name = $('#auth-name').value;
    await Account.api(authMode, body);
    $('#auth-pass').value = '';
    showHome();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    hubBusy = false;
    $('#auth-submit').disabled = false;
  }
});

// ---------- Escolha do inicial ----------

function showStarter() {
  $('#starter-options').innerHTML = Object.entries(STARTERS).map(([id, s]) => `
    <div class="starter-card" style="--type:${TYPE_COLORS[CARDS[id].type]}">
      ${cardImgTag(CARDS[id])}
      <h3>${s.name}</h3>
      <p>${s.hint}</p>
      <div class="mini-deck">${s.deck.map((c) => `<span title="${CARDS[c].name}">${cardImgTag(CARDS[c])}</span>`).join('')}</div>
      <button class="primary" data-starter="${id}">Escolher ${s.name}</button>
    </div>`).join('');
  $('#starter-error').textContent = '';
  showScreen('#starter');
}

$('#starter-options').addEventListener('click', async (e) => {
  const id = e.target.dataset && e.target.dataset.starter;
  if (!id || hubBusy) return;
  hubBusy = true;
  try {
    await Account.api('starter', { starter: id });
    showHome();
    showBanner(`${STARTERS[id].name}, eu escolho você!`);
  } catch (err) {
    $('#starter-error').textContent = err.message;
  } finally {
    hubBusy = false;
  }
});

// ---------- Início ----------

let viewArena = 0; // arena mostrada na vitrine (as setas deixam espiar as outras)

const mascotImg = (arena) => cardImage(CARDS[POKEDEX[arena.mascot - 1].id]);
// Caminho absoluto: dentro de variáveis CSS, url() relativo seria resolvido a partir da pasta css/
const cssUrl = (path) => `url("${new URL(path, document.baseURI).href}")`;

let lastNav = 'home'; // aba de baixo (a Conta abre por cima dela e devolve o destaque ao fechar)
function setNav(name) {
  if (name !== 'account') lastNav = name;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  // Trocar de aba sempre começa com a tela no lugar (nada da página rolado)
  window.scrollTo(0, 0);
  for (const el of [document.documentElement, document.body, $('#app'), $('#hub'), $('#hub-content')]) el.scrollTop = 0;
}

function renderHub() {
  const u = Account.user;
  viewArena = Math.min(viewArena, ARENAS.length - 1);
  $('#hub-name').textContent = u.name;
  $('#hub-avatar').src = cardImage(CARDS[(u.look && u.look.avatar) || u.starter] || CARDS[u.starter]);
  $('#hub-level').textContent = u.level;
  const cur = TRAINER_XP[u.level - 1];
  const next = TRAINER_XP[u.level];
  $('#hub-xp').style.width = next ? `${((u.xp - cur) / (next - cur)) * 100}%` : '100%';
  // Duas versões do texto: inteira ("1.499/1.500 XP") e curta para a barra estreita do celular ("1,4k/1,5k")
  const [have, need] = [u.xp - cur, next - cur];
  $('#hub-xp-text').innerHTML = next
    ? `<span class="xp-full">${fmtNum(have)}/${fmtNum(need)} XP</span><span class="xp-short">${fmtShort(have, 1000)}/${fmtShort(need, 1000)}</span>`
    : 'Máximo';
  for (const [id, n] of [['#hub-gold', u.gold], ['#hub-fichas', u.fichas || 0], ['#hub-trophies', u.trophies]]) {
    $(id).textContent = fmtShort(n);
    $(id).title = fmtNum(n);
  }
  $('#hub').style.setProperty('--map-full', cssUrl(arenaMapUrl(ARENAS[u.arena])));
  renderShowcase();
  renderDeckStrip();
  renderBalls();
}

// Próximo ginásio e se o jogador já está no portão dele (troféus no limite da rota)
function gymGate() {
  const u = Account.user;
  const gym = nextGym(u.arena);
  return { gym, atGate: !!gym && u.trophies >= gym.trophies };
}

// Como se libera uma etapa ainda trancada
function unlockHint(a) {
  if (a.kind === 'gym') return `Chegue a 🏆 ${fmtNum(a.trophies)} e vença ${a.leader} em melhor de 3`;
  const gym = [...ARENAS].reverse().find((g) => g.kind === 'gym' && g.id < a.id);
  return `Chegue a 🏆 ${fmtNum(a.trophies)}${gym && Account.user.arena < gym.id ? ` depois de vencer ${gym.leader}` : ''}`;
}

function renderShowcase() {
  const u = Account.user;
  const a = ARENAS[viewArena];
  const mine = viewArena === u.arena;
  const locked = viewArena > u.arena;
  $('#hub-mascot').src = mascotImg(a);
  $('#hub-arena-name').textContent = a.name;
  $('#hub-arena-sub').textContent = `${a.leader ? `Líder: ${a.leader} · ` : ''}${a.types.map((t) => TYPE_NAMES[t]).join(', ')}`;
  const preview = $('#hub-arena');
  preview.style.setProperty('--map', cssUrl(arenaMapUrl(a)));
  preview.classList.toggle('current', mine);
  const lock = $('#hub-arena-lock');
  lock.classList.toggle('hidden', !locked);
  if (locked) lock.innerHTML = `<b>🔒</b>${unlockHint(a)}`;
  $('#arena-prev').disabled = viewArena === 0;
  $('#arena-next').disabled = viewArena === ARENAS.length - 1;
  // Meta do próximo desafio: barra de troféus até o portão; no portão, vira o botão do desafio do Líder
  const { gym, atGate } = gymGate();
  const goal = $('#hub-gym');
  goal.classList.toggle('challenge', atGate);
  if (!gym) {
    goal.innerHTML = `<img class="goal-ico" src="${badgeUrl(ARENAS[ARENAS.length - 1])}" alt=""><span class="goal-text"><b>Campeão de Kanto!</b><small>Suba no ranking</small></span>`;
  } else if (atGate) {
    const { wins, losses } = u.gym || { wins: 0, losses: 0 };
    const score = wins || losses ? ` · ${wins}–${losses}` : '';
    goal.innerHTML = `<img class="goal-ico mascot" src="${mascotImg(gym)}" alt=""><span class="goal-text"><b>${gym.leader}</b><small>Desafiar · melhor de 3${score}</small></span>`;
  } else {
    const from = ARENAS[u.arena].trophies;
    const pct = Math.max(0, Math.min(100, ((u.trophies - from) / Math.max(1, gym.trophies - from)) * 100));
    goal.innerHTML = `<img class="goal-ico" src="${badgeUrl(gym)}" alt=""><span class="goal-text"><b>${gym.short}</b>
      <small>🏆 ${fmtNum(u.trophies)}/${fmtNum(gym.trophies)} · desafio</small><span class="goal-bar"><i style="width:${pct}%"></i></span></span>`;
  }
  $('#hub-battle-sub').textContent = mine ? 'vale troféus e balls' : `na ${ARENAS[u.arena].short}`;
}

function renderDeckStrip() {
  const deck = Account.user.deck || [];
  $('#hub-deck').innerHTML = deck.map((id) => {
    const c = CARDS[id];
    const own = Account.card(id);
    return `<div class="card small${isNewCard(id) ? ' is-new' : ''}" data-card="${id}" title="${c.name}" style="--type:${TYPE_COLORS[c.type]};--rarity:${RARITIES[rarityOf(c)].color}">
      ${cardImgTag(c)}<div class="cost">${c.cost}</div><div class="lvl-tag">Nv. ${own ? own.level : 1}</div></div>`;
  }).join('');
  $('#hub-deck-avg').textContent = deck.length ? `⚡ ${fmt(deckAverageCost(deck))}` : '';
}

$('#arena-prev').addEventListener('click', () => {
  viewArena = Math.max(0, viewArena - 1);
  renderShowcase();
});
$('#arena-next').addEventListener('click', () => {
  viewArena = Math.min(ARENAS.length - 1, viewArena + 1);
  renderShowcase();
});

function openCollection() {
  setNav('collection');
  deckEditor.open({ account: true, sub: 'cards' });
  showScreen('#deck');
}

function openFriends() {
  setNav('home'); // Amigos e Treino abrem a partir da tela inicial (aba Batalhar)
  showScreen('#friends');
  renderFriends();
}

// ---------- Amigos e convites para X1 ----------

async function renderFriends() {
  const box = $('#friends-box');
  box.classList.toggle('hidden', !Account.loggedIn);
  if (!Account.loggedIn) return;
  try {
    const r = await Account.api('friends', {});
    const avatar = (id) => `<img src="${cardImage(CARDS[id] || CARDS.pikachu)}" alt="">`;
    $('#friend-requests').innerHTML = [
      ...r.incoming.map((f) => `<div class="friend-row request">${avatar(f.avatar)}<span class="friend-name">${escapeHtml(f.name)}<small>quer ser seu amigo</small></span>
        <button data-friend-accept="${f.id}" class="primary">Aceitar</button><button data-friend-decline="${f.id}" class="icon" title="Recusar">✕</button></div>`),
      ...r.outgoing.map((f) => `<div class="friend-row pending">${avatar(f.avatar)}<span class="friend-name">${escapeHtml(f.name)}<small>pedido enviado</small></span>
        <button data-friend-remove="${f.id}" class="icon" title="Cancelar pedido">✕</button></div>`),
    ].join('');
    $('#friend-list').innerHTML = r.friends.length
      ? r.friends.map((f) => `<div class="friend-row">${avatar(f.avatar)}<span class="friend-name"><i class="dot ${f.online ? 'on' : ''}"></i>${escapeHtml(f.name)}
          <small>${f.online ? 'online' : 'offline'} · 🏆 ${fmtNum(f.trophies)} · ${ARENAS[f.arena] ? ARENAS[f.arena].short : ''}</small></span>
          <button data-challenge="${f.id}" data-name="${escapeHtml(f.name)}" class="primary" title="Desafiar para um X1">⚔️ X1</button>
          <button data-friend-remove="${f.id}" class="icon" title="Desfazer amizade">✕</button></div>`).join('')
      : '<p class="sub small">Adicione seus amigos pelo nome de treinador para desafiar direto, sem código.</p>';
    setFriendsBadge(r.incoming.length);
  } catch (err) {
    $('#friend-list').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

// Pedidos de amizade: contador no botão Amigos da tela inicial
function setFriendsBadge(n) {
  $('#hub-friends').dataset.badge = n > 0 ? String(n) : '';
}

// Contadores vermelhos na barra de baixo: o que está esperando por você em cada aba
function updateNavBadges() {
  if (!Account.loggedIn || !Account.user) return;
  const now = Account.now();
  const set = (nav, n) => {
    const btn = document.querySelector(`.hub-nav [data-nav="${nav}"]`);
    const v = n > 0 ? String(n) : '';
    if (btn && btn.dataset.badge !== v) btn.dataset.badge = v;
  };
  const fb = Account.user.freeBall;
  const freeReady = fb.available > 0 || (fb.nextAt && Date.parse(fb.nextAt) <= now);
  const ballsReady = Account.state.balls.filter((b) => b.unlockAt && Date.parse(b.unlockAt) <= now).length;
  set('home', ballsReady + (freeReady ? 1 : 0));
  set('shop', Account.user.shopGift ? 1 : 0);
  set('road', gymGate().atGate ? 1 : 0);
  set('collection', newCards().length);
}

// ---------- Cartas novas (selo "NOVO" até abrir a carta) ----------
// Guardado neste aparelho, por conta. Na primeira vez, tudo o que a conta já tem conta como visto.

const seenKey = () => `cartas-vistas:${Account.user.email}`;
function seenCards() {
  try {
    const raw = localStorage.getItem(seenKey());
    if (raw) return new Set(JSON.parse(raw));
    const all = Object.keys(Account.state.collection);
    localStorage.setItem(seenKey(), JSON.stringify(all));
    return new Set(all);
  } catch {
    return new Set(Object.keys(Account.state.collection)); // sem armazenamento: sem selos
  }
}
function newCards() {
  if (!Account.loggedIn || !Account.state) return [];
  const seen = seenCards();
  return Object.keys(Account.state.collection).filter((id) => !seen.has(id));
}
function isNewCard(id) {
  return Account.loggedIn && !!Account.card(id) && !seenCards().has(id);
}
function markCardSeen(id) {
  if (!Account.loggedIn || !Account.card(id)) return;
  const seen = seenCards();
  if (seen.has(id)) return;
  seen.add(id);
  try {
    localStorage.setItem(seenKey(), JSON.stringify([...seen]));
  } catch {
    // sem armazenamento: o selo some ao recarregar
  }
  updateNavBadges();
}

$('#friend-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#friend-name');
  const name = input.value.trim();
  if (!name) return;
  const msg = $('#friend-msg');
  try {
    const r = await Account.api('friend-add', { name });
    msg.textContent = r.status === 'accepted' ? `Agora você e ${r.name} são amigos!` : `Pedido enviado para ${r.name}.`;
    msg.className = 'form-msg good';
    input.value = '';
    renderFriends();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg bad';
  }
});

// Remover amizade pede um segundo toque (evita tirar alguém sem querer)
let removeArmed = null;
$('#friends-box').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.friendAccept) await Account.api('friend-respond', { id: Number(b.dataset.friendAccept), accept: true });
    else if (b.dataset.friendDecline) await Account.api('friend-respond', { id: Number(b.dataset.friendDecline), accept: false });
    else if (b.dataset.friendRemove) {
      if (removeArmed !== b.dataset.friendRemove) {
        removeArmed = b.dataset.friendRemove;
        b.textContent = 'Tirar?';
        b.classList.add('danger');
        setTimeout(() => (removeArmed = null), 3000);
        return;
      }
      removeArmed = null;
      await Account.api('friend-remove', { id: Number(b.dataset.friendRemove) });
    } else if (b.dataset.challenge) {
      challengeFriend(Number(b.dataset.challenge), b.dataset.name);
      return;
    } else return;
    renderFriends();
  } catch (err) {
    $('#friend-msg').textContent = err.message;
    $('#friend-msg').className = 'form-msg bad';
  }
});

// Cria a sala e, quando ela existir, o convite vai para o amigo (ver onRoom em main.js)
function challengeFriend(id, name) {
  pendingInvite = { id, name };
  hostRoom();
}

// De tempos em tempos (fora da partida): marca online, mostra convites e pedidos novos
const seenInvites = new Set();
let currentInvite = null;
async function socialPoll() {
  if (!Account.loggedIn || game || document.visibilityState !== 'visible') return;
  try {
    const r = await Account.api('social-poll', {});
    setFriendsBadge(r.requests);
    const inv = r.invites.find((i) => !seenInvites.has(i.id));
    if (inv && !currentInvite) showInvite(inv);
    // Anfitrião esperando: o amigo recusou
    if (pendingInvite && r.sent && r.sent.status === 'declined' && !$('#lobby').classList.contains('hidden')) {
      setLobbyStatus(`${r.sent.to} recusou o desafio.`);
    }
  } catch {
    // sem conexão: tenta de novo no próximo ciclo
  }
}
setInterval(socialPoll, 10000);
document.addEventListener('visibilitychange', socialPoll);

function showInvite(inv) {
  currentInvite = inv;
  seenInvites.add(inv.id);
  $('#invite-avatar').src = cardImage(CARDS[inv.avatar] || CARDS.pikachu);
  $('#invite-title').textContent = `${inv.from} te desafiou para um X1!`;
  $('#invite-sub').textContent = inv.ranked ? 'Vale troféus.' : 'Amistoso (não vale troféus).';
  $('#invite').classList.remove('hidden');
}

async function answerInvite(accept) {
  const inv = currentInvite;
  currentInvite = null;
  $('#invite').classList.add('hidden');
  if (!inv) return;
  try {
    const r = await Account.api('invite-respond', { id: inv.id, accept });
    if (accept) joinRoom(r.room);
  } catch (err) {
    if (accept) $('#hub-error').textContent = err.message;
  }
}
$('#invite-accept').addEventListener('click', () => answerInvite(true));
$('#invite-decline').addEventListener('click', () => answerInvite(false));

function openTraining() {
  setNav('home');
  renderLanding();
  showScreen('#menu');
}

$('.hub-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-nav]');
  if (!btn) return;
  const go = {
    home: () => showHome(),
    collection: openCollection,
    road: () => {
      setNav('road');
      showRoad();
    },
    account: () => {
      setNav('account');
      showSettings();
    },
    shop: () => showShop(),
  }[btn.dataset.nav];
  if (go) go();
});
$('#hub-deck').addEventListener('click', openCollection);
$('#hub-friends').addEventListener('click', openFriends);
$('#friends-close').addEventListener('click', () => showHome());

function renderBalls() {
  if (!Account.loggedIn) return;
  const now = Account.now();
  const balls = Account.state.balls;
  const slots = [];
  const keys = [];
  const texts = [];
  for (let i = 0; i < BALL_SLOTS; i++) {
    const b = balls[i];
    if (!b) {
      slots.push('<div class="ball-slot empty">Espaço livre<small>Vença para ganhar uma ball</small></div>');
      keys.push('empty');
      texts.push(null);
      continue;
    }
    const left = b.unlockAt ? (Date.parse(b.unlockAt) - now) / 1000 : null;
    let status;
    let cls;
    if (left === null) {
      cls = 'locked';
      status = `Abrir em ${fmtDuration(BALLS[b.tier].seconds)}`;
    } else if (left > 0) {
      cls = 'unlocking';
      status = `⏳ ${fmtDuration(left)}`;
    } else {
      cls = 'ready';
      status = 'Abrir!';
    }
    slots.push(`<button class="ball-slot ${cls}" data-ball="${b.id}" data-state="${cls}">${ballImg(b.tier)}<b>${BALLS[b.tier].name}</b><small>${status}</small></button>`);
    keys.push(`${b.id}|${b.tier}|${cls}`);
    texts.push(status);
  }
  // Só recria os botões quando algo muda de verdade; o cronômetro troca só o texto.
  // (Recriar a cada segundo fazia o toque "sumir" se caísse bem na troca: precisava tocar duas vezes.)
  const list = $('#hub-balls');
  const key = keys.join(',');
  if (list.dataset.key !== key) {
    list.innerHTML = slots.join('');
    list.dataset.key = key;
  } else {
    texts.forEach((t, i) => {
      const small = t !== null && list.children[i] && list.children[i].querySelector('small');
      if (small && small.textContent !== t) small.textContent = t;
    });
  }

  const fb = Account.user.freeBall;
  const ready = fb.available > 0 || (fb.nextAt && Date.parse(fb.nextAt) <= now);
  updateNavBadges();
  const free = $('#hub-free');
  free.disabled = !ready;
  free.classList.toggle('ready', ready);
  const left = ready ? 0 : (Date.parse(fb.nextAt) - now) / 1000;
  const pct = ready ? 100 : Math.max(0, Math.min(100, (1 - left / FREE_BALL_SECONDS) * 100));
  const freeHtml = `${ballImg('poke', 'goal-ico')}<span class="goal-text"><b>Poké Ball</b>
    <small>${ready ? `${fb.available > 1 ? `${fb.available} grátis` : 'grátis'} · abrir!` : `grátis em ${fmtDuration(left)}`}</small><span class="goal-bar"><i style="width:${pct.toFixed(1)}%"></i></span></span>`;
  if (free.dataset.html !== freeHtml) {
    free.innerHTML = freeHtml;
    free.dataset.html = freeHtml;
  }
}

// Atualiza os cronômetros enquanto o início estiver aberto
setInterval(() => {
  if (!$('#hub').classList.contains('hidden')) renderBalls();
}, 1000);

$('#hub-balls').addEventListener('click', async (e) => {
  const slot = e.target.closest('[data-ball]');
  if (!slot || hubBusy) return;
  const id = Number(slot.dataset.ball);
  const state = slot.dataset.state;
  if (state === 'unlocking') return;
  hubBusy = true;
  $('#hub-error').textContent = '';
  try {
    if (state === 'ready') showReward(await Account.api('ball-open', { id }));
    else if (state === 'locked') {
      await Account.api('ball-unlock', { id });
      renderBalls();
    }
  } catch (err) {
    $('#hub-error').textContent = err.message;
    await Account.refresh();
    renderHub();
  } finally {
    hubBusy = false;
  }
});

$('#hub-free').addEventListener('click', async () => {
  if (hubBusy) return;
  hubBusy = true;
  try {
    showReward(await Account.api('free-ball', {}));
  } catch (err) {
    $('#hub-error').textContent = err.message;
  } finally {
    hubBusy = false;
  }
});

$('#hub-battle').addEventListener('click', () => startRankedBot());
// Card do próximo desafio: no portão, começa o desafio; antes, mostra o caminho dos troféus
$('#hub-gym').addEventListener('click', () => (gymGate().atGate ? startGymMatch() : showRoad()));
$('#hub-collection').addEventListener('click', openCollection);
$('#hub-training').addEventListener('click', openTraining);
$('#hub-arena').addEventListener('click', () => showRoad());
$('#hub-host').addEventListener('click', () => {
  pendingInvite = null; // sala comum (com código), sem convite
  hostRoom();
});
$('#hub-join').addEventListener('click', () => joinRoom($('#hub-join-code').value));
$('#hub-join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom(e.target.value);
});
$('#hub-logout').addEventListener('click', async () => {
  await Account.logout().catch(() => {});
  showHome();
});

// ---------- Menus suspensos: ranking (troféus) e minha conta (nome) ----------
// Abrem por cima da tela em que você está (início ou qualquer aba), sem trocar de tela;
// fecham no ✕, clicando fora ou com Esc.

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function openDropdown(id) {
  document.querySelectorAll('.dropdown').forEach((dd) => dd.classList.toggle('hidden', `#${dd.id}` !== id));
}

function closeDropdown() {
  document.querySelectorAll('.dropdown').forEach((dd) => dd.classList.add('hidden'));
  if (document.querySelector('.nav-btn.active[data-nav="account"]')) setNav(lastNav);
}

document.querySelectorAll('.dropdown').forEach((dd) => {
  dd.addEventListener('click', (e) => {
    // Clique fora do painel (no fundo) ou no ✕ fecha
    if (e.target === dd || e.target.closest('.dropdown-close')) closeDropdown();
  });
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.dropdown:not(.hidden)')) closeDropdown();
});

function onActivate(el, fn) {
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  });
}

async function showRanking() {
  openDropdown('#ranking');
  const list = $('#ranking-list');
  $('#ranking-summary').textContent = '';
  list.innerHTML = '<p class="sub small waiting">Carregando</p>';
  try {
    const r = await Account.api('ranking');
    const medal = ['🥇', '🥈', '🥉'];
    const row = (p) => `<div class="rank-row ${p.me ? 'me' : ''}">
        <span class="rank-pos">${medal[p.rank - 1] || `#${p.rank}`}</span>
        <img src="${cardImage(CARDS[p.avatar] || CARDS[p.starter] || CARDS.pikachu)}" alt="">
        <span class="rank-name">${escapeHtml(p.name)}${p.me ? ' <em>(você)</em>' : ''}<small>${COSMETICS[p.title] ? `${COSMETICS[p.title].name} · ` : ''}Nv. ${p.level} · ${ARENAS[p.arena].short}</small></span>
        <span class="rank-trophies">🏆 ${fmtNum(p.trophies)}</span>
      </div>`;
    let html = r.top.map(row).join('');
    if (!r.top.some((p) => p.me)) {
      const u = Account.user;
      html += `<div class="rank-gap">⋯</div>${row({ rank: r.me.rank, name: u.name, starter: u.starter, avatar: u.look.avatar, title: u.look.title, level: u.level, arena: u.arena, trophies: r.me.trophies, me: true })}`;
    }
    list.innerHTML = html || '<p class="sub small">Ninguém no ranking ainda.</p>';
    $('#ranking-summary').textContent = `Você está em ${fmtNum(r.me.rank)}º de ${fmtNum(r.total)} treinadores.`;
    const me = list.querySelector('.rank-row.me');
    if (me) list.scrollTop = me.offsetTop - list.offsetTop - list.clientHeight / 2;
  } catch (err) {
    list.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function showSettings() {
  const u = Account.user;
  $('#set-avatar').src = cardImage(CARDS[u.look.avatar] || CARDS[u.starter]);
  renderLookForm();
  $('#set-name').textContent = u.name;
  $('#set-email').textContent = u.email;
  $('#set-stats').textContent = `Nv. ${u.level} · 🏆 ${fmtNum(u.trophies)} (recorde ${fmtNum(u.bestTrophies)}) · ${ARENAS[u.arena].name}`;
  $('#set-name-input').value = u.name;
  $('#set-pass-current').value = '';
  $('#set-pass-new').value = '';
  $('#msg-name').textContent = '';
  $('#msg-pass').textContent = '';
  openDropdown('#settings');
  renderBadgeCase();
  loadHistory();
}

// ---------- Histórico de partidas ----------

function timeAgo(iso) {
  const s = Math.max(0, (Account.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

// Estojo de insígnias: os 8 ginásios e a Liga, acesos quando vencidos (ter a insígnia = etapa >= ginásio)
function renderBadgeCase() {
  const u = Account.user;
  const gyms = ARENAS.filter((a) => a.kind === 'gym');
  const won = gyms.filter((g) => u.arena >= g.id).length;
  $('#badge-count').textContent = `${won}/${gyms.length}`;
  $('#badge-case').innerHTML = gyms.map((g) => {
    const have = u.arena >= g.id;
    const at = have && u.badges && u.badges[g.map];
    const when = at ? new Date(at).toLocaleDateString('pt-BR') : '';
    const tip = have ? `${g.badge} · venceu ${g.leader}${when ? ` em ${when}` : ''}` : `${g.badge} · vença ${g.leader} (${g.name})`;
    return `<div class="badge-slot ${have ? 'won' : 'locked'}" title="${tip}">
      <img class="badge-icon" src="${badgeUrl(g)}" alt="">${have ? '' : '<span class="badge-lock">🔒</span>'}
      <b>${g.badge.replace(/^Insígnia d[oa] /, '')}</b>
      <small>${g.leader}</small>
    </div>`;
  }).join('');
}

async function loadHistory() {
  const list = $('#history-list');
  list.innerHTML = '<p class="sub small">Carregando…</p>';
  try {
    const { matches } = await Account.api('history', {});
    if (!matches.length) {
      list.innerHTML = '<p class="sub small">Nenhuma partida valendo troféus ainda.</p>';
      return;
    }
    const label = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' };
    list.innerHTML = matches.map((m) => {
      const crowns = m.crowns ? `${m.crowns[0]} x ${m.crowns[1]}` : '';
      const rival = m.opponent || (m.mode === 'online' ? 'Amigo' : 'Bot');
      const delta = m.trophies == null ? '' : `${m.trophies > 0 ? '+' : ''}${m.trophies} 🏆`;
      const deck = (m.deck || []).filter((id) => CARDS[id]).map((id) => `<span title="${CARDS[id].name}">${cardImgTag(CARDS[id])}</span>`).join('');
      return `<div class="history-row ${m.result}">
        <div class="history-top">
          <b>${label[m.result] || '—'}</b> <span>${crowns ? `👑 ${crowns} · ` : ''}contra ${escapeHtml(rival)}</span>
          <span class="history-delta">${delta}</span>
        </div>
        <small>${{ online: '🌐 Online', gym: '🏅 Ginásio' }[m.mode] || '🤖 Bot'} · ${ARENAS[m.arena] ? ARENAS[m.arena].short : ''} · ${timeAgo(m.at)}</small>
        ${deck ? `<div class="mini-deck">${deck}</div>` : ''}
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function ownsCosmetic(id) {
  return hasCosmetic(id, Account.user.arena, Account.state.cosmetics || []);
}

function renderLookForm() {
  const look = Account.user.look;
  const opts = (list, current) => list.map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const avatars = Account.ownedIds().filter((id) => CARDS[id].kind === 'unit').sort((x, y) => CARDS[x].dex - CARDS[y].dex);
  $('#look-avatar').innerHTML = opts(avatars.map((id) => [id, `#${CARDS[id].dex} ${CARDS[id].name}`]), look.avatar);
  for (const kind of ['title', 'skin', 'emotes']) {
    const mine = Object.entries(COSMETICS).filter(([id, c]) => c.kind === kind && ownsCosmetic(id));
    if ($(`#look-${kind}`)) $(`#look-${kind}`).innerHTML = opts(mine.map(([id, c]) => [id, c.name]), look[kind]);
  }
}

$('#look-skin-open').addEventListener('click', () => {
  closeDropdown();
  setNav('collection');
  deckEditor.open({ account: true, sub: 'skins' });
  showScreen('#deck');
});

document.querySelectorAll('#look-avatar, #look-title, #look-emotes').forEach((sel) => {
  sel.addEventListener('change', async () => {
    const kind = sel.id.replace('look-', '');
    try {
      await Account.api('look', { [kind]: sel.value });
      $('#set-avatar').src = cardImage(CARDS[Account.user.look.avatar] || CARDS[Account.user.starter]);
      renderHub();
      formMsg($('#msg-look'), 'Visual atualizado!', true);
    } catch (err) {
      formMsg($('#msg-look'), err.message, false);
      renderLookForm();
    }
  });
});

function formMsg(el, text, good) {
  el.textContent = text;
  el.className = `form-msg ${good ? 'good' : 'bad'}`;
}

onActivate($('#hub-trophies-chip'), showRanking);
onActivate($('#hub-trainer'), showSettings);

$('#form-name').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await Account.api('settings-name', { name: $('#set-name-input').value });
    $('#set-name').textContent = Account.user.name;
    renderHub();
    formMsg($('#msg-name'), 'Nome atualizado!', true);
  } catch (err) {
    formMsg($('#msg-name'), err.message, false);
  }
});

$('#form-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await Account.api('settings-password', { current: $('#set-pass-current').value, password: $('#set-pass-new').value });
    $('#set-pass-current').value = '';
    $('#set-pass-new').value = '';
    formMsg($('#msg-pass'), 'Senha trocada! Os outros aparelhos foram desconectados.', true);
  } catch (err) {
    formMsg($('#msg-pass'), err.message, false);
  }
});

$('#set-logout').addEventListener('click', async () => {
  await Account.logout().catch(() => {});
  showHome();
});

// ---------- Caminho dos troféus ----------

// Mapa da jornada: caminho vertical da Rota 1 (embaixo) até a Liga (em cima). Ginásios em círculos maiores
// com a insígnia; o trecho já percorrido fica dourado e "Você" marca a etapa atual
function showRoad() {
  setNav('road');
  const u = Account.user;
  const won = ARENAS.filter((a) => a.kind === 'gym' && u.arena >= a.id).length;
  const gyms = ARENAS.filter((a) => a.kind === 'gym').length;
  $('#road-summary').innerHTML = `🏆 ${fmtNum(u.trophies)} · recorde ${fmtNum(u.bestTrophies)} · 🏅 ${won}/${gyms} insígnias`;
  renderRoadNext();
  $('#road-list').innerHTML = [...ARENAS].reverse().map((a, i) => {
    const reached = u.arena >= a.id;
    const current = u.arena === a.id;
    const side = i % 2 ? 'left' : 'right'; // o texto alterna de lado, como um caminho
    const count = Object.values(CARDS).filter((c) => arenaOfCard(c) === a.id).length;
    const sub = a.kind === 'gym'
      ? `${a.leader} · ${reached ? a.badge : `🏆 ${fmtNum(a.trophies)} + melhor de 3`}`
      : `🏆 ${fmtNum(a.trophies)} · libera ${count} Pokémon`;
    const art = a.kind === 'gym'
      ? `<img class="map-badge" src="${badgeUrl(a)}" alt="">`
      : `<img class="map-mascot" src="${mascotImg(a)}" alt="">`;
    return `<div class="map-step ${a.kind} ${side} ${reached ? 'reached' : 'locked'} ${current ? 'current' : ''}" data-arena="${a.id}">
      <div class="map-node">${art}${reached ? '' : '<span class="map-lock">🔒</span>'}
        ${current ? `<img class="map-you" src="${$('#hub-avatar').src}" alt="Você">` : ''}</div>
      <div class="map-label"><b>${a.name}</b><small>${sub}</small><span class="map-types">${a.types.map(typeChip).join('')}</span></div>
    </div>`;
  }).join('');
  showScreen('#road');
  const cur = $('#road-list .current');
  const list = $('#road-list');
  if (cur) list.scrollTop = cur.offsetTop - list.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2;
}

// Card do próximo objetivo: o desafio (no portão), a próxima rota com barra de troféus, ou o título de Campeão
function renderRoadNext() {
  const u = Account.user;
  const { gym, atGate } = gymGate();
  const nextStage = ARENAS.find((a) => a.id > u.arena && a.kind === 'route' && (!gym || a.id < gym.id));
  const box = $('#road-next');
  box.classList.toggle('challenge', atGate);
  if (!gym) {
    box.innerHTML = `<img src="${badgeUrl(ARENAS[ARENAS.length - 1])}" alt=""><span><b>Campeão de Kanto!</b><small>Todas as insígnias conquistadas</small></span>`;
    return;
  }
  if (atGate) {
    box.innerHTML = `<img src="${mascotImg(gym)}" alt=""><span><b>Desafie ${gym.leader}</b><small>${gym.name} · melhor de 3 · vale a ${gym.badge}</small></span>`;
    return;
  }
  const target = nextStage || gym;
  const from = ARENAS[u.arena].trophies;
  const pct = Math.max(0, Math.min(100, ((u.trophies - from) / Math.max(1, target.trophies - from)) * 100));
  const label = target.kind === 'gym' ? `Desafio de ${target.short}` : target.name;
  box.innerHTML = `<img src="${target.kind === 'gym' ? badgeUrl(target) : mascotImg(target)}" alt=""><span><b>Próximo: ${label}</b>
    <small>🏆 ${fmtNum(u.trophies)}/${fmtNum(target.trophies)} · faltam ${fmtNum(Math.max(0, target.trophies - u.trophies))}</small>
    <span class="goal-bar"><i style="width:${pct}%"></i></span></span>`;
}

$('#road-next').addEventListener('click', () => {
  if (gymGate().atGate) startGymMatch();
});

$('#road-close').addEventListener('click', () => showHome());

// ---------- Novidades da atualização ----------
// Abre uma vez por aparelho depois de cada atualização (troque o id para mostrar de novo a todos)

const NEWS = {
  id: '2026-10-21b',
  title: '📰 Novidades',
  sub: 'v0.10 · A jornada por Kanto',
  items: [
    ['🗺️', 'Rotas entre os ginásios', '16 rotas novas, cada uma com mapa próprio e Pokémon próprios nas balls (insetos na Floresta de Viridian, Clefairy no Mt. Moon, Snorlax na Rota 12…).'],
    ['🏅', 'Desafio do Líder', 'No fim das rotas os troféus travam: vença o Líder numa melhor de 3, com um deck só do tipo dele, para ganhar a insígnia, 100 Fichas e uma Great Ball.'],
    ['🌊', 'Mapas de mar', 'Na Rota 20, Rota 21, Seafoam e outras, quem não é de água só anda pelos píeres. Os de água nadam 30% mais rápido e podem ser soltos no mar.'],
    ['⚡', 'Elétrico conduz na água', 'Golpe elétrico em quem está nadando dá choque também em quem nada perto.'],
    ['🏆', 'Mais troféus e ginásios mais perto', 'Vitória contra o bot vale 25 troféus, +1 por vitória seguida. Os ginásios atiram de mais perto.'],
  ],
};

function openNews(force = false) {
  try {
    if (!force && localStorage.getItem('news-seen') === NEWS.id) return;
  } catch {
    // sem armazenamento (aba anônima): mostra mesmo assim
  }
  $('#news-title').textContent = NEWS.title;
  $('#news-sub').textContent = NEWS.sub;
  $('#news-list').innerHTML = NEWS.items
    .map(([icon, title, text]) => `<li><span class="news-icon">${icon}</span><div><b>${title}</b><p>${text}</p></div></li>`)
    .join('');
  $('#news').classList.remove('hidden');
}
$('#news-ok').addEventListener('click', () => {
  $('#news').classList.add('hidden');
  try {
    localStorage.setItem('news-seen', NEWS.id);
  } catch {
    // sem armazenamento: aparece de novo na próxima vez
  }
});

// ---------- Recompensas ----------

// Presente de versão (ex.: uma construção na v0.8): abre sozinho ao entrar, uma vez por conta
async function openPendingGift() {
  const id = Account.loggedIn && Account.user.pendingGift;
  if (!id || hubBusy) return;
  hubBusy = true;
  try {
    const r = await Account.api('gift', { id });
    showReward({ tier: 'premier', contents: r.contents, newCards: r.newCards, title: `🎁 ${r.title}`, text: r.text });
  } catch {
    // já recebido (outra aba) ou sem conexão: tenta de novo na próxima vez
  } finally {
    hubBusy = false;
  }
}

function showReward(result) {
  const { tier } = result;
  $('#reward-title').innerHTML = result.title
    ? `${ballImg(tier, 'reward-ball')}<span>${result.title}${result.text ? `<small class="reward-sub">${result.text}</small>` : ''}</span>`
    : `${ballImg(tier, 'reward-ball')}<span>${BALLS[tier].name}</span>`;
  fillReward(result);
  $('.reward-panel').classList.remove('reward-pop');
  playBallOpening(tier);
  openRewardOverlay();
}

// O pop-up abre por cima da aba em que você está (ex.: a Loja); no início, como uma tela própria
function openRewardOverlay() {
  const onTab = Account.loggedIn && TAB_SCREENS.some((s) => !$(s).classList.contains('hidden'));
  rewardOverTab = onTab;
  if (onTab) $('#reward').classList.remove('hidden');
  else showScreen('#reward');
}
let rewardOverTab = false;

// Compra ou resgate na loja (carta, item ou visual): o mesmo pop-up da ball, sem a bola abrindo —
// o que você ganhou aparece direto, com um brilho atrás
function showPurchase({ title, text, icon, contents = {}, newCards = [], extra = '' }) {
  $('#reward-title').innerHTML = `${icon ? `<span class="reward-icon">${icon}</span>` : ''}<span>${title}${text ? `<small class="reward-sub">${text}</small>` : ''}</span>`;
  fillReward({ contents, newCards });
  if (extra) $('#reward-extra').innerHTML += extra;
  clearTimeout(ballTimer);
  $('#reward-open').classList.add('hidden');
  $('#reward-body').classList.remove('hidden');
  const panel = $('.reward-panel');
  panel.classList.remove('reward-pop');
  void panel.offsetWidth; // reinicia a animação
  panel.classList.add('reward-pop');
  rewardReturn = '#shop';
  openRewardOverlay();
}

// Cartas, Pokédólares e itens ganhos, dentro do pop-up de recompensa
function fillReward({ contents, newCards = [] }) {
  const cards = Object.entries(contents.cards || {}).sort((a, b) => {
    const order = ['legendary', 'epic', 'rare', 'common'];
    return order.indexOf(rarityOf(CARDS[a[0]])) - order.indexOf(rarityOf(CARDS[b[0]]));
  });
  $('#reward-cards').innerHTML = cards.map(([id, n], i) => {
    const c = CARDS[id];
    const isNew = newCards.includes(id);
    return `<div class="card small reward-card" style="--type:${TYPE_COLORS[c.type]};--rarity:${RARITIES[rarityOf(c)].color};animation-delay:${i * 0.12}s">
      ${cardImgTag(c)}<div class="count">×${n}</div>${isNew ? '<div class="new">Novo!</div>' : ''}<div class="name">${c.name}</div></div>`;
  }).join('');
  const items = Object.entries(contents.items || {}).map(([id, n]) => `<span class="reward-item">${itemImg(id)} ${ITEMS[id].name} ×${n}</span>`).join('');
  $('#reward-extra').innerHTML = `${contents.gold ? `<span class="reward-gold">💰 +${fmtNum(contents.gold)}</span>` : ''}${items}`;
}

// ---------- Animação da ball abrindo ----------
// A ball cai, balança 3 vezes, o botão brilha, a metade de cima abre num clarão e as cartas aparecem.

const BALL_LOOKS = {
  poke: { top: '#e3350d', bottom: '#f4f4f4', band: '#222', ring: '#222' },
  premier: { top: '#f7f7f7', bottom: '#ffffff', band: '#d6301c', ring: '#d6301c' },
  great: { top: '#2f6fdb', bottom: '#f4f4f4', band: '#222', ring: '#222', extra: 'great' },
  ultra: { top: '#262626', bottom: '#f4f4f4', band: '#222', ring: '#222', extra: 'ultra' },
  master: { top: '#7b3fb5', bottom: '#f4f4f4', band: '#222', ring: '#222', extra: 'master' },
};

function ballSvg(tier) {
  const b = BALL_LOOKS[tier] || BALL_LOOKS.poke;
  const extras = {
    great: '<path d="M14 40 Q22 18 40 14 L34 30 Q24 32 20 44 Z" fill="#e3350d"/><path d="M86 40 Q78 18 60 14 L66 30 Q76 32 80 44 Z" fill="#e3350d"/>',
    ultra: '<rect x="22" y="2" width="12" height="44" rx="4" fill="#f8c630"/><rect x="66" y="2" width="12" height="44" rx="4" fill="#f8c630"/>',
    master: '<circle cx="24" cy="30" r="8" fill="#e95ea8"/><circle cx="76" cy="30" r="8" fill="#e95ea8"/><text x="50" y="34" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="sans-serif">M</text>',
  };
  return `<div class="ball-burst"></div>
    <svg class="ball-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id="ball-top-clip" clipPathUnits="userSpaceOnUse"><path d="M5 50 A45 45 0 0 1 95 50 Z"/></clipPath></defs>
      <path d="M5 50 A45 45 0 0 0 95 50 Z" fill="${b.bottom}" stroke="#1a1a1a" stroke-width="3"/>
      <g class="ball-top">
        <g clip-path="url(#ball-top-clip)">
          <path d="M5 50 A45 45 0 0 1 95 50 Z" fill="${b.top}"/>
          ${extras[b.extra] || ''}
          <path d="M14 30 Q22 14 40 10" stroke="rgba(255,255,255,0.55)" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>
        <path d="M5 50 A45 45 0 0 1 95 50" fill="none" stroke="#1a1a1a" stroke-width="3"/>
      </g>
      <rect x="4" y="46" width="92" height="8" fill="${b.band}"/>
      <circle class="ball-button" cx="50" cy="50" r="13" fill="#f4f4f4" stroke="${b.ring}" stroke-width="5"/>
      <circle cx="50" cy="50" r="6" fill="#fff" stroke="#bbb" stroke-width="1.5"/>
    </svg>
    <div class="ball-name">${BALLS[tier].name}</div>
    <small class="ball-skip">toque para pular</small>`;
}

let ballTimer = null;

function playBallOpening(tier) {
  const open = $('#reward-open');
  const body = $('#reward-body');
  clearTimeout(ballTimer);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    open.classList.add('hidden');
    body.classList.remove('hidden');
    return;
  }
  open.innerHTML = ballSvg(tier);
  open.className = `ball-open tier-${tier}`;
  body.classList.add('hidden');
  void open.offsetWidth; // reinicia as animações CSS
  open.classList.add('playing');
  ballTimer = setTimeout(revealReward, 2600);
}

function revealReward() {
  clearTimeout(ballTimer);
  $('#reward-open').classList.add('hidden');
  $('#reward-body').classList.remove('hidden');
}

$('#reward-open').addEventListener('click', revealReward);
let rewardReturn = null; // tela para voltar depois de coletar (ex.: a loja, quando a ball foi comprada lá)
$('#reward-ok').addEventListener('click', () => {
  const back = rewardReturn;
  rewardReturn = null;
  if (back === '#shop') showShop();
  else if (rewardOverTab) $('#reward').classList.add('hidden'); // continua na aba de baixo
  else showHome();
  rewardOverTab = false;
});

// ---------- PokéMart ----------

let shopData = null;

const priceLabel = (p) => (p.fichas ? `🪙 ${fmtNum(p.fichas)}` : p.gold ? `💰 ${fmtNum(p.gold)}` : 'Grátis');

function offerView(o) {
  if (o.kind === 'card') {
    const c = CARDS[o.card];
    const r = RARITIES[rarityOf(c)];
    return {
      img: cardImgTag(c), name: c.name,
      info: o.free ? `Presente do dia · ×${o.amount}` : `<span style="color:${r.color}">${r.name}</span> · ${Account.owns(o.card) ? `Nv ${Account.card(o.card).level}` : 'nova!'}`,
      style: `--type:${TYPE_COLORS[c.type]}`,
    };
  }
  if (o.kind === 'ball') return { img: ballImg(o.tier), name: BALLS[o.tier].name, info: `${BALLS[o.tier].cards}+ cartas, abre na hora` };
  const item = ITEMS[o.item];
  const info = o.item === 'rarecandy' ? 'Sobe 1 nível de qualquer carta'
    : `Cópia curinga de ${item.types.map((t) => TYPE_NAMES[t]).join(', ')}`;
  return { img: itemImg(o.item), name: item.name, info };
}

function renderShop() {
  const u = Account.user;
  $('#shop-wallet').innerHTML = `💰 ${fmtNum(u.gold)} · 🪙 ${fmtNum(u.fichas || 0)}`;
  updateShopClock();
  const section = (title, hint, list) => `<h3 class="shop-title">${title}${hint ? ` <small>${hint}</small>` : ''}</h3>
    <div class="offer-grid">${list.map((o) => {
      const v = offerView(o);
      const soldOut = o.remaining <= 0;
      const cost = o.price;
      const afford = u.gold >= cost.gold && (u.fichas || 0) >= cost.fichas;
      const left = o.limit > 1 ? `<small class="offer-left">${o.remaining}/${o.limit}</small>` : '';
      // kind-*: não usar a classe "card" (é a das cartas da mão, que bloqueia gestos de toque)
      return `<div class="offer kind-${o.kind} ${soldOut ? 'sold-out' : ''} ${o.free ? 'free' : ''}" style="${v.style || ''}">
        <div class="offer-art">${v.img}${o.amount > 1 ? `<span class="offer-amount">×${o.amount}</span>` : ''}</div>
        <b class="offer-name">${v.name}</b>
        <small class="offer-info">${v.info}</small>
        ${left}
        <button data-offer="${o.id}" class="${o.free ? 'primary' : ''}" ${soldOut || !afford ? 'disabled' : ''}>${soldOut ? (o.weekly ? 'Esgotado na semana' : 'Esgotado') : priceLabel(cost)}</button>
      </div>`;
    }).join('')}</div>`;
  const offers = shopData.offers;
  $('#shop-body').innerHTML = safariBanner()
    + section('Ofertas do dia', 'o preço sobe a cada cópia', offers.filter((o) => o.kind === 'card'))
    + section('Balls e itens do dia', '1 por dia', offers.filter((o) => o.kind !== 'card' && !o.weekly))
    + section('Especiais da semana', 'com Fichas 🪙', offers.filter((o) => o.weekly))
    + cosmeticsSection();
}

// ---------- Zona Safári ----------

let safariData = null;

function safariBanner() {
  const s = safariData;
  let action = '';
  if (s && !s.run) {
    action = `<button id="safari-enter" class="primary" ${Account.user.gold < s.entryGold ? 'disabled' : ''}>Entrar · 💰 ${fmtNum(s.entryGold)}</button>`;
  } else if (s && !s.run.done) {
    action = '<button id="safari-enter" class="primary">Continuar</button>';
  } else if (s) {
    action = '<button id="safari-enter">Ver resultado</button>';
  }
  return `<div class="safari-banner">
    <img src="${itemIcon('safari-ball')}" alt="">
    <div><b>Zona Safári</b><small>Capture Pokémon das suas arenas com Isca, Pedra e Safari Balls. 1 entrada por dia.</small></div>
    ${action}
  </div>`;
}

const safariPortrait = (card, mood) => `${SPRITE_COLLAB}/portrait/${String(CARDS[card].dex).padStart(4, '0')}/${mood}.png`;

function renderSafari(flash) {
  const run = safariData.run;
  const box = $('#safari-body');
  if (run.done) {
    const caught = run.caught.map((c) => {
      const card = CARDS[c.card];
      return `<div class="card small reward-card" style="--type:${TYPE_COLORS[card.type]};--rarity:${RARITIES[rarityOf(card)].color}">${cardImgTag(card)}<div class="count">×${c.copies}</div><div class="name">${card.name}</div></div>`;
    }).join('');
    box.innerHTML = `<div class="safari-end">
      <h3>${run.caught.length ? `Você pegou ${run.caught.length} Pokémon!` : 'Nenhum Pokémon desta vez…'}</h3>
      <div class="safari-caught">${caught}</div>
      <p class="sub small">A Zona Safári abre de novo amanhã.</p>
      <button id="safari-done" class="wide primary">Voltar à loja</button>
    </div>`;
    return;
  }
  const card = CARDS[run.wild.card];
  const mood = run.wild.angry ? 'Angry' : run.wild.eating ? 'Happy' : 'Normal';
  const status = run.wild.angry ? '💢 Bravo: mais fácil de pegar, mais fácil de fugir'
    : run.wild.eating ? '🍓 Comendo: mais difícil de pegar, menos chance de fugir' : 'Atento';
  const rarity = RARITIES[rarityOf(card)];
  box.innerHTML = `<div class="safari-scene">
      <div class="safari-info">Encontro ${run.encounter}/${SAFARI.encounters}
        <span class="safari-balls">${`<img src="${itemIcon('safari-ball')}" alt="">`.repeat(run.balls)}<b>×${run.balls}</b></span></div>
      <div class="safari-wild ${flash || ''}" style="--type:${TYPE_COLORS[card.type]}">
        <img src="${safariPortrait(card.id, mood)}" alt="" onerror="this.onerror=null;this.src='${cardImage(card)}'">
      </div>
      <h3>${card.name} <small style="color:${rarity.color}">${rarity.name}</small> ${card.types.map(typeChip).join('')}</h3>
      <p class="safari-status">${status}</p>
      <div class="safari-actions">
        <button data-safari="ball" class="primary"><img src="${itemIcon('safari-ball')}" alt=""> Safari Ball</button>
        <button data-safari="bait">🍓 Isca</button>
        <button data-safari="rock">🪨 Pedra</button>
        <button data-safari="run">🏃 Fugir</button>
      </div>
      <div class="safari-log">${run.log.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
    </div>`;
}

async function showSafari() {
  setNav('shop');
  try {
    if (!safariData) safariData = await Account.api('safari');
    if (!safariData.run) {
      const r = await Account.api('safari-start', {});
      safariData.run = r.run;
      renderHub();
    }
    showScreen('#safari');
    renderSafari();
  } catch (err) {
    formMsg($('#shop-msg'), err.message, false);
  }
}

$('#safari-body').addEventListener('click', async (e) => {
  if (e.target.closest('#safari-done')) return showShop();
  const btn = e.target.closest('[data-safari]');
  if (!btn || hubBusy) return;
  hubBusy = true;
  document.querySelectorAll('[data-safari]').forEach((b) => (b.disabled = true));
  try {
    const r = await Account.api('safari-act', { action: btn.dataset.safari });
    const wasThrow = btn.dataset.safari === 'ball';
    safariData.run = r.run;
    if (r.caught) renderHub();
    renderSafari(wasThrow ? (r.caught ? 'caught' : 'escaped') : '');
  } catch (err) {
    renderSafari();
    $('#safari-body').insertAdjacentHTML('afterbegin', `<p class="error">${escapeHtml(err.message)}</p>`);
  } finally {
    hubBusy = false;
  }
});
$('#safari-back').addEventListener('click', () => showShop());

const KIND_NAMES = { title: 'Título', skin: 'Ginásios', emotes: 'Emotes' };

function cosmeticPreview(id, c) {
  if (c.kind === 'emotes') return `<img src="${emotePortraitUrl(id, 'Happy')}" alt="">`;
  if (c.kind === 'skin') return `<img src="assets/ginasios/lider-azul.webp" alt="" style="filter:${c.filter || 'none'} drop-shadow(0 0 6px ${c.glow || 'transparent'})">`;
  return '<span class="title-badge">🏷️</span>';
}

function cosmeticsSection() {
  const u = Account.user;
  const forSale = Object.entries(COSMETICS).filter(([, c]) => c.fichas);
  return `<h3 class="shop-title">Visual <small>com Fichas 🪙 · não muda atributos · equipe em Minha conta</small></h3>
    <div class="offer-grid">${forSale.map(([id, c]) => {
      const have = ownsCosmetic(id);
      const afford = (u.fichas || 0) >= c.fichas;
      return `<div class="offer kind-cosmetic ${have ? 'sold-out' : ''}">
        <div class="offer-art">${cosmeticPreview(id, c)}</div>
        <b class="offer-name">${escapeHtml(c.name)}</b>
        <small class="offer-info">${KIND_NAMES[c.kind]}</small>
        <button data-cosmetic="${id}" ${have || !afford ? 'disabled' : ''}>${have ? 'Você tem' : `🪙 ${fmtNum(c.fichas)}`}</button>
      </div>`;
    }).join('')}</div>`;
}

function updateShopClock() {
  if (!shopData) return;
  const left = (Date.parse(shopData.nextRefresh) - Account.now()) / 1000;
  if (left <= 0 && !$('#shop').classList.contains('hidden')) {
    shopData = null;
    showShop();
    return;
  }
  $('#shop-refresh').textContent = `Novas ofertas em ${fmtDuration(left)} (meia-noite, horário de Brasília)`;
}

setInterval(() => {
  if (!$('#shop').classList.contains('hidden')) updateShopClock();
}, 1000);

async function showShop() {
  setNav('shop');
  showScreen('#shop');
  $('#shop-msg').textContent = '';
  if (!shopData) $('#shop-body').innerHTML = '<p class="sub small waiting">Abrindo a loja</p>';
  try {
    [shopData, safariData] = await Promise.all([Account.api('shop'), Account.api('safari')]);
    renderShop();
  } catch (err) {
    $('#shop-body').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

$('#shop-body').addEventListener('click', async (e) => {
  const cos = e.target.closest('[data-cosmetic]');
  if (cos && !cos.disabled && !hubBusy) {
    hubBusy = true;
    cos.disabled = true;
    try {
      const id = cos.dataset.cosmetic;
      await Account.api('cosmetic-buy', { id });
      renderHub();
      renderShop();
      const c = COSMETICS[id];
      showPurchase({
        title: 'Comprado!',
        text: `${escapeHtml(c.name)} · ${KIND_NAMES[c.kind]}`,
        extra: `<div class="reward-cosmetic">${cosmeticPreview(id, c)}<small>Equipe em Minha conta (toque no seu nome).</small></div>`,
      });
    } catch (err) {
      formMsg($('#shop-msg'), err.message, false);
    } finally {
      hubBusy = false;
    }
    return;
  }
  if (e.target.closest('#safari-enter')) {
    showSafari();
    return;
  }
  const btn = e.target.closest('[data-offer]');
  if (!btn || btn.disabled || hubBusy) return;
  hubBusy = true;
  btn.disabled = true;
  const offer = shopData.offers.find((o) => o.id === btn.dataset.offer);
  try {
    const r = await Account.api('shop-buy', { offer: btn.dataset.offer });
    shopData = r.shop;
    renderHub();
    if (r.kind === 'ball') {
      rewardReturn = '#shop';
      showReward(r);
      return;
    }
    renderShop();
    const title = offer && offer.free ? 'Resgatado!' : 'Comprado!';
    if (r.kind === 'card') {
      showPurchase({
        title,
        text: r.newCards.length ? 'Pokémon novo na sua Pokédex!' : 'Cópias guardadas na sua Pokédex',
        contents: { cards: { [r.card]: r.amount } },
        newCards: r.newCards,
      });
    } else {
      showPurchase({
        title,
        text: 'Use na Pokédex, na carta que quiser',
        icon: itemImg(r.item),
        contents: { items: { [r.item]: r.amount || 1 } },
      });
    }
  } catch (err) {
    formMsg($('#shop-msg'), err.message, false);
    await Account.refresh();
    showShop();
  } finally {
    hubBusy = false;
  }
});

// ---------- Partidas que valem troféus ----------

async function startRankedBot() {
  if (hubBusy) return;
  hubBusy = true;
  $('#hub-error').textContent = '';
  try {
    const r = await Account.api('match-start', { mode: 'bot' });
    const deck = Account.user.deck;
    level = r.bot.difficulty;
    beginMatch('bot', 0, [deck, r.bot.deck], {
      levels: [Account.levelsFor(deck), r.bot.levels],
      trainers: [Account.user.level, r.bot.trainer],
      ranked: { matchId: r.matchId, mode: 'bot' },
      arena: Account.user.arena,
    });
    showBanner(`${ARENAS[Account.user.arena].name}: batalha!`);
  } catch (err) {
    $('#hub-error').textContent = err.message;
  } finally {
    hubBusy = false;
  }
}

// Desafio do Líder: cada partida da melhor de 3 começa aqui (o servidor guarda o placar da série)
async function startGymMatch() {
  if (hubBusy) return;
  hubBusy = true;
  $('#hub-error').textContent = '';
  try {
    const r = await Account.api('match-start', { mode: 'gym' });
    gymSeriesOver = false;
    const deck = Account.user.deck;
    level = r.bot.difficulty;
    beginMatch('bot', 0, [deck, r.bot.deck], {
      levels: [Account.levelsFor(deck), r.bot.levels],
      trainers: [Account.user.level, r.bot.trainer],
      ranked: { matchId: r.matchId, mode: 'gym' },
      arena: r.gym.id,
    });
    const game = r.gym.wins + r.gym.losses + 1;
    showBanner(`${ARENAS[r.gym.id].name}: ${r.bot.leader} · partida ${game} (${r.gym.wins}–${r.gym.losses})`);
  } catch (err) {
    showHome(err.message);
  } finally {
    hubBusy = false;
  }
}

// Tela de vitória do desafio: insígnia grande com brilho girando, nome dela e do Líder, e as recompensas
// (ball, Fichas, rota liberada) em etiquetas pequenas
function badgeWinHtml(out) {
  const gym = ARENAS[out.gym.id];
  const chips = [];
  if (out.ball) chips.push(`<span class="reward-chip">${ballImg(out.ball.tier)} ${BALLS[out.ball.tier].name}</span>`);
  else if (out.slotsFull) chips.push('<span class="reward-chip muted">Espaços de ball cheios</span>');
  if (out.fichas > 0) chips.push(`<span class="reward-chip"><img src="assets/icones/coin.png" alt=""> +${out.fichas} Fichas</span>`);
  if (ARENAS[out.arena] && ARENAS[out.arena].kind === 'route' && out.arena > gym.id) {
    chips.push(`<span class="reward-chip">Nova rota: <b>${ARENAS[out.arena].name}</b></span>`);
  }
  return `<div class="badge-win">
    <div class="badge-win-art"><span class="badge-win-rays"></span><img src="${badgeUrl(gym)}" alt="${gym.badge}"></div>
    <b class="badge-win-name">${gym.badge}</b>
    <small>Você venceu ${gym.leader} por ${out.gym.wins}–${out.gym.losses}</small>
    <div class="badge-win-chips">${chips.join('')}</div>
  </div>`;
}

// Fim de uma partida do desafio: placar da série e o que ela deu
function gymResultHtml(out) {
  const g = out.gym;
  const gym = ARENAS[g.id];
  const dots = `${'🏅'.repeat(g.wins)}${'✖️'.repeat(g.losses)}`;
  if (g.done === 'lost') return `<div class="trophy-delta down">${gym.leader} venceu o desafio (${g.wins}–${g.losses}) · 🏆 ${out.delta} <small>(${fmtNum(out.trophies)})</small></div>`;
  return `<div class="gym-score">${dots} <b>${g.wins}–${g.losses}</b> contra ${gym.leader} · melhor de 3</div>`;
}

// Online: cada jogador registra a própria partida no servidor
function registerOnlineMatch() {
  if (!ranked || !Account.loggedIn) {
    ranked = null;
    return;
  }
  Account.api('match-start', { mode: 'online' })
    .then((r) => {
      if (ranked) ranked.matchId = r.matchId;
    })
    .catch((err) => {
      ranked = null;
      showBanner(`Sem troféus nesta partida: ${err.message}`);
    });
}

// Resultado para o servidor; devolve o texto mostrado na tela de fim
// Manda o resultado e, se a conexão cair (ou o servidor estiver reiniciando), tenta de novo algumas vezes:
// senão uma vitória do desafio do Líder simplesmente se perdia. Se a primeira tentativa chegou mas a resposta
// não voltou, a seguinte recebe 409 (já contada): aí só atualiza o estado
async function sendMatchResult(body) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Account.api('match-finish', body);
    } catch (err) {
      if (attempt > 0 && err.status === 409) {
        await Account.refresh();
        return null;
      }
      const network = !err.status || err.status >= 500;
      if (!network || attempt >= 4) throw err;
      await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
    }
  }
}

async function finishRanked(result) {
  const r = ranked;
  ranked = null;
  if (!r || !r.matchId) return null;
  try {
    const crowns = game ? [game.crowns[mySide], game.crowns[1 - mySide]] : null;
    const out = await sendMatchResult({ matchId: r.matchId, result, crowns, opponent: rivalName });
    if (!out) {
      if (r.mode === 'gym') {
        // Já contada: o placar da série vem do estado atualizado (zerado = a série terminou)
        gymSeriesOver = !Account.user.gym.wins && !Account.user.gym.losses;
        $('#btn-again').textContent = gymSeriesOver ? 'Batalhar na rota' : 'Próxima partida';
      }
      return '<div class="won-ball">Resultado registrado.</div>';
    }
    // Venceu o desafio do Líder: a insígnia é o destaque; o resto vem resumido embaixo
    if (out.gym && out.gym.done === 'won') {
      gymSeriesOver = true;
      $('#btn-again').textContent = 'Batalhar na rota';
      return badgeWinHtml(out);
    }
    const lines = [];
    if (out.gym) {
      lines.push(gymResultHtml(out));
      // Série terminada: o "de novo" volta a batalhar na rota
      gymSeriesOver = !!out.gym.done;
      $('#btn-again').textContent = gymSeriesOver ? 'Batalhar na rota' : 'Próxima partida';
    } else {
      const sign = out.delta > 0 ? '+' : '';
      lines.push(`<div class="trophy-delta ${out.delta >= 0 ? 'up' : 'down'}">🏆 ${sign}${out.delta} <small>(${fmtNum(out.trophies)})</small></div>`);
      if (out.atGate) lines.push(`<div class="won-ball">🏅 Troféus no limite: desafie ${nextGym(out.arena).leader} para seguir!</div>`);
    }
    if (out.ball) lines.push(`<div class="won-ball">${ballImg(out.ball.tier)} Você ganhou uma <b>${BALLS[out.ball.tier].name}</b>!</div>`);
    else if (out.slotsFull) lines.push('<div class="won-ball muted">Espaços de ball cheios: abra uma para ganhar a próxima.</div>');
    if (out.fichas > 0) {
      const why = [out.badge && 'insígnia', out.arenaUp && !out.badge && 'rota nova', out.levelUp && 'nível de treinador novo', out.firstWin && '1ª vitória do dia'].filter(Boolean).join(' · ');
      lines.push(`<div class="won-ball">🪙 <b>+${out.fichas} Fichas</b> <small>(${why})</small></div>`);
    }
    if (out.arenaUp && ARENAS[out.arena].kind === 'route') lines.push(`<div class="arena-up">🎉 Nova rota: <b>${ARENAS[out.arena].name}</b>!</div>`);
    return lines.join('');
  } catch (err) {
    return `<div class="won-ball muted">${err.message}</div>`;
  }
}

// ---------- Início do app ----------

(async function boot() {
  await Account.refresh();
  const invite = new URLSearchParams(location.search).get('sala');
  if (invite) {
    history.replaceState(null, '', location.pathname);
    $('#join-code').value = formatCode(normalizeCode(invite));
    joinRoom(invite);
  } else {
    showHome();
  }
})();
