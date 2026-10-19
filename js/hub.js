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
    ? '<button id="menu-back" class="wide primary">← Voltar para a conta</button>'
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

function renderHub() {
  const u = Account.user;
  const arena = ARENAS[u.arena];
  $('#hub-name').textContent = u.name;
  $('#hub-level').textContent = u.level;
  const cur = TRAINER_XP[u.level - 1];
  const next = TRAINER_XP[u.level];
  $('#hub-xp').style.width = next ? `${((u.xp - cur) / (next - cur)) * 100}%` : '100%';
  $('#hub-xp-text').textContent = next ? `${fmtNum(u.xp - cur)}/${fmtNum(next - cur)} XP` : 'Nível máximo';
  $('#hub-gold').textContent = `💰 ${fmtNum(u.gold)}`;
  $('#hub-arena-name').textContent = arena.name;
  $('#hub-trophies').textContent = `🏆 ${fmtNum(u.trophies)}`;
  $('#hub-arena').style.setProperty('--arena', arena.ground[0]);
  renderBalls();
}

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
$('#hub-collection').addEventListener('click', () => {
  deckEditor.open({ account: true });
  showScreen('#deck');
});
$('#hub-training').addEventListener('click', () => {
  renderLanding();
  showScreen('#menu');
});
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

// ---------- Caminho dos troféus ----------

function showRoad() {
  const u = Account.user;
  $('#road-list').innerHTML = [...ARENAS].reverse().map((a) => {
    const reached = u.arena >= a.id;
    const current = u.arena === a.id;
    const count = Object.values(CARDS).filter((c) => arenaOfCard(c) === a.id).length;
    const types = a.types.map(typeChip).join('');
    return `<div class="road-step ${reached ? 'reached' : ''} ${current ? 'current' : ''}" style="--arena:${a.ground[0]}">
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
  if (cur) cur.scrollIntoView({ block: 'center' });
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
  showScreen('#reward');
}

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
