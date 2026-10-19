// Editor de deck / coleção.
// Modo treino: todas as cartas, deck salvo no navegador.
// Modo conta: só cartas da coleção, com nível, cópias, melhorias e itens; deck salvo no servidor.

const DECK_STORAGE_KEY = 'pokeroyale.deck.v1';

function loadDeck() {
  try {
    const deck = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY));
    if (isValidDeck(deck)) return deck;
  } catch {
    // armazenamento indisponível ou corrompido: usa o padrão
  }
  return [...DEFAULT_DECK];
}

function saveDeck(deck) {
  try {
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // modo anônimo etc.: o deck vale só nesta sessão
  }
}

const fmt = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function speedLabel(v) {
  if (v < 0.8) return 'lento';
  if (v < 1.2) return 'médio';
  if (v < 1.5) return 'rápido';
  return 'muito rápido';
}

function typeChip(type) {
  return `<span class="type-chip" style="background:${TYPE_COLORS[type]}">${TYPE_NAMES[type]}</span>`;
}

// Fallback da arte da carta: retrato do SpriteCollab -> sprite da PokéAPI
function cardImgTag(card) {
  const alt = card.kind === 'unit' ? spriteFront(card.dex) : '';
  return `<img src="${cardImage(card)}" alt="" loading="lazy"${alt ? ` onerror="this.onerror=null;this.src='${alt}'"` : ''}>`;
}

const itemImg = (id) => `<img class="item-icon" src="${itemIcon(ITEMS[id].icon)}" alt="">`;

class DeckEditor {
  constructor(onClose) {
    this.onClose = onClose;
    this.el = (sel) => document.querySelector(sel);
    this.draft = [];
    this.focused = null;
    this.account = false;
    this.busy = false;

    this.el('#deck-search').addEventListener('input', () => this.renderGrid());
    this.el('#deck-type').addEventListener('change', () => this.renderGrid());
    this.el('#deck-sort').addEventListener('change', () => this.renderGrid());
    this.el('#deck-random').addEventListener('click', () => {
      const pool = this.account ? Account.ownedIds() : undefined;
      this.setDraft(randomDeck(pool));
    });
    this.el('#deck-default').addEventListener('click', () => {
      this.setDraft(this.account ? [...STARTERS[Account.user.starter].deck] : [...DEFAULT_DECK]);
    });
    this.el('#deck-close').addEventListener('click', () => this.onClose(false));
    this.el('#deck-save').addEventListener('click', () => this.save());
    this.el('#deck-grid').addEventListener('click', (e) => this._pick(e));
    this.el('#deck-subtabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sub]');
      if (b) this.setSub(b.dataset.sub);
    });
    this.el('#skin-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-skin]');
      if (!b) return;
      this.skinFocus = b.dataset.skin;
      this.el('#skin-msg').textContent = '';
      this.renderSkins();
    });
    this.el('#skin-preview').addEventListener('click', (e) => {
      if (e.target.closest('#skin-action')) this.skinAction();
    });
    this.el('#deck-slots').addEventListener('click', (e) => this._pick(e));
    this.el('#deck-info').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'deck-info-close') {
        this.focused = null;
        this.renderInfo();
        this.renderGrid();
      }
      if (btn.id === 'deck-toggle') this.toggle(this.focused);
      if (btn.id === 'deck-upgrade') this.upgrade(this.focused);
      if (btn.dataset.item) this.useItem(btn.dataset.item, this.focused);
    });
  }

  open({ account = false, sub = 'cards' } = {}) {
    this.account = account;
    const typeSel = this.el('#deck-type');
    typeSel.innerHTML = (account ? '<option value="owned">Minhas cartas</option>' : '')
      + '<option value="">Todos os tipos</option>'
      + Object.keys(TYPE_NAMES).map((t) => `<option value="${t}">${TYPE_NAMES[t]}</option>`).join('')
      + '<option value="spell">Golpes</option>';
    this.el('#deck-title').textContent = account ? 'Coleção' : 'Deck de treino';
    // Sub-abas (só com conta): Cartas | Ginásios
    this.el('#deck-subtabs').classList.toggle('hidden', !account);
    this.setSub(sub);
    this.el('#deck-default').textContent = account ? 'Inicial' : 'Padrão';
    this.focused = null;
    this.setDraft(account ? [...Account.user.deck] : loadDeck());
  }

  setSub(sub) {
    this.sub = this.account ? sub : 'cards';
    this.el('.deck-panel').classList.toggle('sub-skins', this.sub === 'skins');
    document.querySelectorAll('#deck-subtabs [data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === this.sub));
    if (this.sub === 'skins') {
      this.skinFocus = Account.user.look.skin;
      this.renderSkins();
    }
  }

  // ---------- Aba Ginásios: prévia de cada skin, inclusive as bloqueadas ----------

  skinStatus(id) {
    const c = COSMETICS[id];
    if (Account.user.look.skin === id) return { key: 'equipped', label: '✔ Equipado' };
    if (ownsCosmetic(id)) return { key: 'owned', label: 'Equipar' };
    if (c.arena !== undefined) return { key: 'arena', label: `🔒 Chegue a ${ARENAS[c.arena].name} (🏆 ${fmtNum(ARENAS[c.arena].trophies)})` };
    return { key: 'buy', label: `Comprar · 🪙 ${fmtNum(c.fichas)}` };
  }

  skinImg(id, which) {
    const c = COSMETICS[id];
    const glow = c.glow ? ` drop-shadow(0 0 6px ${c.glow}) drop-shadow(0 0 3px ${c.glow})` : '';
    return `<img src="assets/ginasios/${which}-azul.webp" alt="" style="filter:${c.filter || ''}${glow}">`;
  }

  renderSkins() {
    const skins = Object.keys(COSMETICS).filter((id) => COSMETICS[id].kind === 'skin');
    const focus = COSMETICS[this.skinFocus] ? this.skinFocus : Account.user.look.skin;
    const c = COSMETICS[focus];
    const st = this.skinStatus(focus);
    const fichas = Account.user.fichas || 0;
    const arena = ARENAS[Account.user.arena];
    const disabled = st.key === 'equipped' || st.key === 'arena' || (st.key === 'buy' && fichas < c.fichas);
    const how = c.free ? 'Grátis.' : c.arena !== undefined ? `Conquistado ao chegar em ${ARENAS[c.arena].name}.` : `Vendido na Loja por 🪙 ${c.fichas}.`;
    this.el('#skin-preview').innerHTML = `
      <div class="skin-stage ${c.sparkle ? 'sparkle' : ''} ${st.key === 'arena' || st.key === 'buy' ? 'locked-preview' : ''}" style="--map:url('${new URL(arenaMapUrl(arena, true), document.baseURI).href}')">
        ${this.skinImg(focus, 'lateral')}${this.skinImg(focus, 'lider')}${this.skinImg(focus, 'lateral')}
      </div>
      <div class="skin-detail">
        <b>${c.name}</b>
        <small>${how} ${c.sparkle ? 'Com brilhinhos piscando. ' : ''}Só muda o visual dos seus ginásios; seu oponente também vê.</small>
        <button id="skin-action" class="${st.key === 'owned' || st.key === 'buy' ? 'primary' : ''}" ${disabled ? 'disabled' : ''}>${st.label}</button>
        ${st.key === 'buy' && fichas < c.fichas ? `<small class="bad">Você tem 🪙 ${fmtNum(fichas)}. Ganhe Fichas subindo de arena, de nível e na 1ª vitória do dia.</small>` : ''}
      </div>`;
    this.el('#skin-grid').innerHTML = skins.map((id) => {
      const s = this.skinStatus(id);
      const locked = s.key === 'arena' || s.key === 'buy';
      return `<button class="skin-item ${id === focus ? 'focused' : ''} ${locked ? 'locked' : ''} ${s.key}" data-skin="${id}">
        ${this.skinImg(id, 'lider')}
        <b>${COSMETICS[id].name}</b>
        <small>${s.key === 'equipped' ? '✔ Equipado' : s.key === 'owned' ? 'Seu' : s.key === 'arena' ? `🔒 ${ARENAS[COSMETICS[id].arena].short}` : `🔒 🪙 ${COSMETICS[id].fichas}`}</small>
      </button>`;
    }).join('');
    this.el('#deck-gold').textContent = `💰 ${Account.user.gold.toLocaleString('pt-BR')} · 🪙 ${fichas.toLocaleString('pt-BR')}`;
  }

  async skinAction() {
    if (this.busy) return;
    const id = this.skinFocus;
    const st = this.skinStatus(id);
    this.busy = true;
    try {
      if (st.key === 'buy') {
        await Account.api('cosmetic-buy', { id });
        await Account.api('look', { skin: id });
        formMsg(this.el('#skin-msg'), `${COSMETICS[id].name} comprado e equipado!`, true);
      } else if (st.key === 'owned') {
        await Account.api('look', { skin: id });
        formMsg(this.el('#skin-msg'), `${COSMETICS[id].name} equipado. Aparece na próxima partida.`, true);
      }
      renderHub();
    } catch (err) {
      formMsg(this.el('#skin-msg'), err.message, false);
    } finally {
      this.busy = false;
      this.renderSkins();
    }
  }

  async save() {
    if (!isValidDeck(this.draft) || this.busy) return;
    if (!this.account) {
      saveDeck(this.draft);
      this.onClose(true);
      return;
    }
    this.busy = true;
    try {
      await Account.api('deck', { deck: this.draft });
      this.flash('Deck salvo! É com ele que você batalha.', true);
      this.renderAll();
    } catch (err) {
      this.flash(err.message);
    } finally {
      this.busy = false;
    }
  }

  async upgrade(id) {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await Account.api('upgrade', { card: id });
      this.flash(`${CARDS[id].name} subiu para o nível ${r.level}!`, true);
    } catch (err) {
      this.flash(err.message);
    } finally {
      this.busy = false;
      this.renderAll();
    }
  }

  async useItem(item, id) {
    if (this.busy) return;
    this.busy = true;
    try {
      await Account.api('use-item', { item, card: id });
      this.flash(`${ITEMS[item].name} usada em ${CARDS[id].name}.`, true);
    } catch (err) {
      this.flash(err.message);
    } finally {
      this.busy = false;
      this.renderAll();
    }
  }

  flash(text, good = false) {
    const box = this.el('#deck-msg');
    box.textContent = text;
    box.className = good ? 'good' : 'bad';
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => (box.textContent = ''), 3500);
  }

  _pick(e) {
    const el = e.target.closest('[data-card]');
    if (!el) return;
    // Tocar de novo na carta aberta fecha os detalhes
    this.focused = this.focused === el.dataset.card ? null : el.dataset.card;
    this.renderInfo();
    this.renderGrid();
  }

  setDraft(deck) {
    this.draft = [...deck];
    this.renderAll();
  }

  renderAll() {
    this.renderSlots();
    this.renderGrid();
    this.renderInfo();
    this.el('#deck-gold').textContent = this.account ? `💰 ${Account.user.gold.toLocaleString('pt-BR')}` : '';
  }

  canUse(id) {
    return !this.account || Account.owns(id);
  }

  toggle(id) {
    if (!id || !this.canUse(id)) return;
    const i = this.draft.indexOf(id);
    if (i >= 0) {
      this.draft.splice(i, 1);
      this.focused = null; // removeu: fecha os detalhes da carta
    }
    else if (this.draft.length < DECK_SIZE) this.draft.push(id);
    this.renderAll();
  }

  renderSlots() {
    const slots = [];
    for (let i = 0; i < DECK_SIZE; i++) {
      const id = this.draft[i];
      slots.push(id ? this._cardHTML(CARDS[id], 'small', true) : '<div class="slot"></div>');
    }
    this.el('#deck-slots').innerHTML = slots.join('');
    const n = this.draft.length;
    this.el('#deck-avg').textContent = n ? `Custo médio ${fmt(deckAverageCost(this.draft))}` : '';
    const save = this.el('#deck-save');
    save.disabled = n !== DECK_SIZE;
    save.textContent = n === DECK_SIZE ? 'Salvar' : `Faltam ${DECK_SIZE - n}`;
  }

  _filtered() {
    const q = this.el('#deck-search').value.trim().toLowerCase();
    const type = this.el('#deck-type').value;
    const sort = this.el('#deck-sort').value;
    const list = Object.values(CARDS).filter((c) => {
      if (type === 'owned' && !Account.owns(c.id)) return false;
      if (type === 'spell' && c.kind !== 'spell') return false;
      if (type && type !== 'spell' && type !== 'owned' && !(c.types || [c.type]).includes(type)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || String(c.dex || '') === q.replace('#', '');
    });
    const dexOf = (c) => c.dex || 999;
    if (sort === 'cost') list.sort((a, b) => a.cost - b.cost || dexOf(a) - dexOf(b));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    else list.sort((a, b) => dexOf(a) - dexOf(b));
    // Na coleção, as cartas que você tem vêm primeiro
    if (this.account) list.sort((a, b) => Number(Account.owns(b.id)) - Number(Account.owns(a.id)));
    return list;
  }

  renderGrid() {
    this.el('#deck-grid').innerHTML = this._filtered().map((c) => this._cardHTML(c, 'small')).join('');
  }

  _cardHTML(c, size, inSlot = false) {
    const classes = ['card', size];
    if (!inSlot && this.draft.includes(c.id)) classes.push('in-deck');
    if (this.focused === c.id) classes.push('focused');
    let extra = c.dex ? `<span class="dexno">#${c.dex}</span>` : '';
    if (this.account) {
      const own = Account.card(c.id);
      if (!own) {
        classes.push('locked');
      } else {
        const cost = upgradeCost(c, own.level);
        if (cost && own.copies >= cost.copies) classes.push('can-upgrade');
        extra = `<span class="lvl">Nv ${own.level}</span>`;
      }
    }
    return `<div class="${classes.join(' ')}" data-card="${c.id}" style="--type:${TYPE_COLORS[c.type]};--rarity:${RARITIES[rarityOf(c)].color}">${cardImgTag(c)}<div class="cost">${c.cost}</div>${extra}<div class="name">${c.name}</div></div>`;
  }

  renderInfo() {
    const box = this.el('#deck-info');
    const c = CARDS[this.focused];
    if (!c) {
      box.innerHTML = '<p class="hint">Toque numa carta para ver os detalhes.</p>';
      return;
    }
    const own = this.account ? Account.card(c.id) : null;
    const level = own ? own.level : null;
    const mult = level ? levelMultiplier(c, level) : 1;
    const inDeck = this.draft.includes(c.id);
    const full = this.draft.length >= DECK_SIZE;
    const buttons = [];
    if (this.canUse(c.id)) {
      buttons.push(inDeck
        ? '<button id="deck-toggle">Remover</button>'
        : `<button id="deck-toggle" class="primary" ${full ? 'disabled' : ''}>${full ? 'Deck cheio' : 'Adicionar'}</button>`);
    }

    let stats;
    if (c.kind === 'spell') {
      stats = `💥 ${Math.round(c.dmg * mult)} de dano · raio ${fmt(c.radius)} · ${Math.round(c.towerMult * 100)}% nos ginásios`;
    } else {
      const each = c.count ? ` (×${c.count})` : '';
      stats = `❤️ ${Math.round(c.hp * mult)}${each} · ⚔️ ${Math.round(c.dmg * mult)} a cada ${fmt(c.hitSpeed)} s · 🎯 ${c.range > 1.5 ? fmt(c.range) : 'corpo a corpo'} · 👟 ${speedLabel(c.speed)}`;
    }
    const types = (c.types || [c.type]).map(typeChip).join('');
    const atk = c.kind === 'unit' && !c.types.includes(c.type) ? ` · ataque ${TYPE_NAMES[c.type]}` : '';
    const rarity = RARITIES[rarityOf(c)];

    let progress = '';
    if (this.account) {
      if (own) {
        const cost = upgradeCost(c, own.level);
        if (cost) {
          const ready = own.copies >= cost.copies;
          const pct = Math.min(100, (own.copies / cost.copies) * 100);
          progress = `<div class="copies"><div class="copies-bar"><i style="width:${pct}%"></i><span>${own.copies}/${cost.copies}</span></div>
            <button id="deck-upgrade" class="${ready ? 'primary' : ''}" ${ready && Account.user.gold >= cost.gold ? '' : 'disabled'}>Melhorar · 💰 ${cost.gold.toLocaleString('pt-BR')}</button></div>`;
        } else {
          progress = '<div class="copies"><b>Nível máximo!</b></div>';
        }
        const items = Object.entries(Account.state.items || {}).filter(([id, n]) => n > 0 && itemFitsCard(id, c)
          && !(id === 'rarecandy' && own.level >= MAX_CARD_LEVEL));
        if (items.length) {
          progress += `<div class="item-row">${items.map(([id, n]) => `<button data-item="${id}" title="${ITEMS[id].name}">${itemImg(id)} ${ITEMS[id].name} ×${n}</button>`).join('')}</div>`;
        }
      } else {
        const arena = ARENAS[arenaOfCard(c)];
        progress = `<div class="copies locked-hint">🔒 Aparece nas Premier Balls a partir de <b>${arena.name}</b>.</div>`;
      }
    }

    box.innerHTML = `
      <button id="deck-info-close" class="icon info-close" title="Fechar detalhes" aria-label="Fechar detalhes">✕</button>
      ${cardImgTag(c)}
      <div class="info-body">
        <h3>${c.name} ${c.dex ? `<small>#${c.dex}</small>` : ''} ${types}</h3>
        <div class="stats"><span class="rarity" style="color:${rarity.color}">${rarity.name}</span>${level ? ` · <b>Nível ${level}</b>` : ''} · ⚡ ${c.cost} de energia${atk}</div>
        <div class="stats">${stats}</div>
        <div class="desc">${c.desc}</div>
        ${progress}
      </div>
      <div class="info-actions">${buttons.join('')}</div>`;
  }
}
