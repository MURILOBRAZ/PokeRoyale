// Telas da conta: entrar/criar conta, escolha do inicial, início (troféus, Premier Balls),
// caminho dos troféus, abertura de balls e partidas que valem troféus.
// Usa funções do main.js (beginMatch, showScreen, hostRoom...) e o Account (account.js).

let hubBusy = false;

const fmtNum = (n) => Number(n).toLocaleString('pt-BR');

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
      if (!$('#hub').classList.contains('hidden') && Account.loggedIn) renderHub();
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

function setNav(name) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  // Trocar de aba sempre começa com a tela no lugar (nada da página rolado)
  window.scrollTo(0, 0);
  for (const el of [document.documentElement, document.body, $('#app'), $('#hub'), $('#hub-content')]) el.scrollTop = 0;
}

function renderHub() {
  const u = Account.user;
  viewArena = Math.min(viewArena, ARENAS.length - 1);
  $('#hub-name').textContent = u.name;
  $('#hub-avatar').src = cardImage(CARDS[u.starter]);
  $('#hub-level').textContent = u.level;
  const cur = TRAINER_XP[u.level - 1];
  const next = TRAINER_XP[u.level];
  $('#hub-xp').style.width = next ? `${((u.xp - cur) / (next - cur)) * 100}%` : '100%';
  $('#hub-xp-text').textContent = next ? `${fmtNum(u.xp - cur)}/${fmtNum(next - cur)} XP` : 'Máximo';
  $('#hub-gold').textContent = fmtNum(u.gold);
  $('#hub-trophies').textContent = fmtNum(u.trophies);
  $('#hub').style.setProperty('--map-full', cssUrl(arenaMapUrl(ARENAS[u.arena])));
  renderShowcase();
  renderJourney();
  renderDeckStrip();
  renderBalls();
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
  if (locked) lock.innerHTML = `<b>🔒</b>Chegue a 🏆 ${fmtNum(a.trophies)} para liberar`;
  $('#arena-prev').disabled = viewArena === 0;
  $('#arena-next').disabled = viewArena === ARENAS.length - 1;
  $('#hub-battle-sub').textContent = mine
    ? 'Contra o bot · vale troféus e Premier Balls'
    : `Você batalha na sua arena: ${ARENAS[u.arena].name}`;
  document.querySelectorAll('.journey-step').forEach((el) => el.classList.toggle('viewing', Number(el.dataset.arena) === viewArena));
}

function renderJourney() {
  const u = Account.user;
  $('#hub-journey').innerHTML = ARENAS.map((a) => {
    const reached = u.arena >= a.id;
    const cls = [reached ? '' : 'locked', u.arena === a.id ? 'current' : '', viewArena === a.id ? 'viewing' : ''].join(' ');
    return `<button class="journey-step ${cls}" data-arena="${a.id}">
      <img src="${mascotImg(a)}" alt="">
      <span class="j-name">${a.short}<small>${a.leader || 'Começo da jornada'} · 🏆 ${fmtNum(a.trophies)}</small></span>
      ${reached ? '' : '🔒'}<span class="type-dot" style="background:${TYPE_COLORS[a.types[0]]}" title="${TYPE_NAMES[a.types[0]]}"></span>
    </button>`;
  }).join('');
}

function renderDeckStrip() {
  const deck = Account.user.deck || [];
  $('#hub-deck').innerHTML = deck.map((id) => {
    const c = CARDS[id];
    const own = Account.card(id);
    return `<div class="card small" data-card="${id}" title="${c.name}" style="--type:${TYPE_COLORS[c.type]};--rarity:${RARITIES[rarityOf(c)].color}">
      ${cardImgTag(c)}<div class="cost">${c.cost}</div><div class="lvl-tag">Nv. ${own ? own.level : 1}</div></div>`;
  }).join('');
  $('#hub-deck-avg').textContent = deck.length ? `Custo médio ${fmt(deckAverageCost(deck))}` : '';
}

$('#arena-prev').addEventListener('click', () => {
  viewArena = Math.max(0, viewArena - 1);
  renderShowcase();
});
$('#arena-next').addEventListener('click', () => {
  viewArena = Math.min(ARENAS.length - 1, viewArena + 1);
  renderShowcase();
});
$('#hub-journey').addEventListener('click', (e) => {
  const step = e.target.closest('[data-arena]');
  if (!step) return;
  viewArena = Number(step.dataset.arena);
  renderShowcase();
});

function openCollection() {
  setNav('collection');
  deckEditor.open({ account: true });
  showScreen('#deck');
}

function openFriends() {
  setNav('friends');
  showScreen('#friends');
}

function openTraining() {
  setNav('training');
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
    friends: openFriends,
    training: openTraining,
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
  const anyUnlocking = balls.some((b) => b.unlockAt && Date.parse(b.unlockAt) > now);
  const slots = [];
  for (let i = 0; i < BALL_SLOTS; i++) {
    const b = balls[i];
    if (!b) {
      slots.push('<div class="ball-slot empty">Espaço livre<small>Vença para ganhar uma ball</small></div>');
      continue;
    }
    const left = b.unlockAt ? (Date.parse(b.unlockAt) - now) / 1000 : null;
    let status;
    let cls;
    if (left === null) {
      cls = anyUnlocking ? 'locked wait' : 'locked';
      status = anyUnlocking ? `🔒 ${fmtDuration(BALLS[b.tier].seconds)}` : `Abrir em ${fmtDuration(BALLS[b.tier].seconds)}`;
    } else if (left > 0) {
      cls = 'unlocking';
      status = `⏳ ${fmtDuration(left)}`;
    } else {
      cls = 'ready';
      status = 'Abrir!';
    }
    slots.push(`<button class="ball-slot ${cls}" data-ball="${b.id}" data-state="${cls}">${ballImg(b.tier)}<b>${BALLS[b.tier].name}</b><small>${status}</small></button>`);
  }
  $('#hub-balls').innerHTML = slots.join('');

  const fb = Account.user.freeBall;
  const ready = fb.available > 0 || (fb.nextAt && Date.parse(fb.nextAt) <= now);
  const free = $('#hub-free');
  free.disabled = !ready;
  free.innerHTML = ready
    ? `${ballImg('poke')} Poké Ball grátis${fb.available > 1 ? ' ×2' : ''} — abrir!`
    : `${ballImg('poke')} Próxima Poké Ball grátis em ${fmtDuration((Date.parse(fb.nextAt) - now) / 1000)}`;
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
    } else {
      $('#hub-error').textContent = 'Já tem uma ball abrindo. Espere ela terminar.';
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
$('#hub-collection').addEventListener('click', openCollection);
$('#hub-training').addEventListener('click', openTraining);
$('#hub-arena').addEventListener('click', () => showRoad());
$('#hub-host').addEventListener('click', () => hostRoom());
$('#hub-join').addEventListener('click', () => joinRoom($('#hub-join-code').value));
$('#hub-join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom(e.target.value);
});
$('#hub-logout').addEventListener('click', async () => {
  await Account.logout().catch(() => {});
  showHome();
});

// ---------- Menus suspensos: ranking (troféus) e minha conta (nome) ----------
// Abrem por cima do início, sem trocar de aba; fecham no ✕, clicando fora ou com Esc.

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let dropdownReturn = null; // aba que estava aberta antes do menu

function openDropdown(id) {
  const visible = TAB_SCREENS.find((s) => !$(s).classList.contains('hidden'));
  dropdownReturn = visible || null;
  showScreen(id);
}

function closeDropdown() {
  if (dropdownReturn) showScreen(dropdownReturn);
  else showScreen('#hub');
  dropdownReturn = null;
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
        <img src="${cardImage(CARDS[p.starter] || CARDS.pikachu)}" alt="">
        <span class="rank-name">${escapeHtml(p.name)}${p.me ? ' <em>(você)</em>' : ''}<small>Nv. ${p.level} · ${ARENAS[p.arena].short}</small></span>
        <span class="rank-trophies">🏆 ${fmtNum(p.trophies)}</span>
      </div>`;
    let html = r.top.map(row).join('');
    if (!r.top.some((p) => p.me)) {
      const u = Account.user;
      html += `<div class="rank-gap">⋯</div>${row({ rank: r.me.rank, name: u.name, starter: u.starter, level: u.level, arena: u.arena, trophies: r.me.trophies, me: true })}`;
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
  $('#set-avatar').src = cardImage(CARDS[u.starter]);
  $('#set-name').textContent = u.name;
  $('#set-email').textContent = u.email;
  $('#set-stats').textContent = `Nv. ${u.level} · 🏆 ${fmtNum(u.trophies)} (recorde ${fmtNum(u.bestTrophies)}) · ${ARENAS[u.arena].name}`;
  $('#set-name-input').value = u.name;
  $('#set-pass-current').value = '';
  $('#set-pass-new').value = '';
  $('#msg-name').textContent = '';
  $('#msg-pass').textContent = '';
  openDropdown('#settings');
}

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

function showRoad() {
  setNav('road');
  const u = Account.user;
  $('#road-list').innerHTML = [...ARENAS].reverse().map((a) => {
    const reached = u.arena >= a.id;
    const current = u.arena === a.id;
    const count = Object.values(CARDS).filter((c) => arenaOfCard(c) === a.id).length;
    const types = a.types.map(typeChip).join('');
    return `<div class="road-step ${reached ? 'reached' : ''} ${current ? 'current' : ''}" style='--arena:${a.ground[0]};--map:${cssUrl(arenaMapUrl(a, true))}'>
      <div class="road-trophies">🏆 ${fmtNum(a.trophies)}</div>
      <div class="road-body">
        <b>${a.name}</b>${a.leader ? ` <small>· ${a.leader}</small>` : ''}
        <div>${types}</div>
        <small>${count} Pokémon novos nas balls${a.badge ? ` · ${reached ? '🏅' : '🔒'} ${a.badge}` : ''}</small>
      </div>
      ${current ? '<div class="road-you">Você</div>' : ''}
    </div>`;
  }).join('');
  $('#road-summary').textContent = `Você: 🏆 ${fmtNum(u.trophies)} · recorde ${fmtNum(u.bestTrophies)}`;
  showScreen('#road');
  const cur = $('#road-list .current');
  const list = $('#road-list');
  if (cur) list.scrollTop = cur.offsetTop - list.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2;
}

$('#road-close').addEventListener('click', () => showHome());

// ---------- Recompensas ----------

function showReward(result) {
  const { tier, contents, newCards } = result;
  $('#reward-title').innerHTML = `${ballImg(tier, 'reward-ball')}<span>${BALLS[tier].name}</span>`;
  const cards = Object.entries(contents.cards).sort((a, b) => {
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
  $('#reward-extra').innerHTML = `<span class="reward-gold">💰 +${fmtNum(contents.gold)}</span>${items}`;
  playBallOpening(tier);
  showScreen('#reward');
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
$('#reward-ok').addEventListener('click', () => showHome());

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
async function finishRanked(result) {
  const r = ranked;
  ranked = null;
  if (!r || !r.matchId) return null;
  try {
    const out = await Account.api('match-finish', { matchId: r.matchId, result });
    const lines = [];
    const sign = out.delta > 0 ? '+' : '';
    lines.push(`<div class="trophy-delta ${out.delta >= 0 ? 'up' : 'down'}">🏆 ${sign}${out.delta} <small>(${fmtNum(out.trophies)})</small></div>`);
    if (out.ball) lines.push(`<div class="won-ball">${ballImg(out.ball.tier)} Você ganhou uma <b>${BALLS[out.ball.tier].name}</b>!</div>`);
    else if (out.slotsFull) lines.push('<div class="won-ball muted">Espaços de ball cheios: abra uma para ganhar a próxima.</div>');
    if (out.arenaUp) {
      const a = ARENAS[out.arena];
      lines.push(`<div class="arena-up">🎉 Nova arena: <b>${a.name}</b>!${a.badge ? ` Você ganhou a ${a.badge}.` : ''}</div>`);
    }
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
