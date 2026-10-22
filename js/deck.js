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
    this.el('#deck-close').addEventListener('click', () => {
      this.flushSave(); // com conta, o que mudou já vai sendo salvo sozinho
      this.onClose(false);
    });
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
    this.el('#deck-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (b) this.selectSlot(Number(b.dataset.slot));
    });
    this._initDrag();
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
    typeSel.innerHTML = (account ? '<option value="owned">Meus Pokémon</option>' : '')
      + '<option value="">Todos os tipos</option>'
      + Object.keys(TYPE_NAMES).map((t) => `<option value="${t}">${TYPE_NAMES[t]}</option>`).join('')
      + '<option value="spell">Golpes</option>'
      + '<option value="building">Construções</option>';
    this.el('#deck-title').textContent = account ? 'Pokédex' : 'Deck de treino';
    // Com conta o deck é salvo sozinho: sem Aleatório / Inicial / Salvar (só no deck de treino)
    this.el('#deck-buttons').classList.toggle('hidden', account);
    // Sub-abas (só com conta): Pokémon | Ginásios
    this.el('#deck-subtabs').classList.toggle('hidden', !account);
    this.setSub(sub);
    this.el('#deck-default').textContent = account ? 'Inicial' : 'Padrão';
    this.focused = null;
    this.slot = account ? Account.user.deckIndex || 0 : 0;
    this.pendingDrafts = {};
    this.el('#deck-tabs').classList.toggle('hidden', !account);
    const deck = account ? [...(this.savedDeck() || Account.user.deck)] : loadDeck();
    this.baseline = JSON.stringify(deck);
    this.setDraft(deck);
  }

  // ---------- Vários decks (só com conta) ----------

  savedDeck(slot = this.slot) {
    const decks = Account.user.decks || [Account.user.deck];
    return decks[slot] || null;
  }

  // Mudou em relação ao que está salvo (num espaço vazio, em relação à cópia inicial)
  isDirty() {
    return JSON.stringify(this.draft) !== this.baseline;
  }

  // Salvamento automático (com conta): deck completo é salvo pouco depois de cada mudança
  scheduleSave() {
    clearTimeout(this._saveTimer);
    if (!this.account || !this.isDirty() || !isValidDeck(this.draft)) return;
    this._saveTimer = setTimeout(() => this.flushSave(), 700);
  }

  flushSave() {
    clearTimeout(this._saveTimer);
    if (!this.account || !this.isDirty() || !isValidDeck(this.draft)) return this.saving || Promise.resolve();
    const deck = [...this.draft];
    const slot = this.slot;
    const before = this.baseline;
    this.baseline = JSON.stringify(deck);
    this.saving = (this.saving || Promise.resolve()).then(async () => {
      try {
        await Account.api('deck', { deck, slot });
        this.flash(`Deck ${slot + 1} salvo ✓`, true);
      } catch (err) {
        if (this.slot === slot) this.baseline = before;
        this.flash(err.message);
      }
      this.renderTabs();
      this.renderSaveButton();
    });
    this.renderSaveButton();
    return this.saving;
  }

  renderTabs() {
    if (!this.account) return;
    const decks = Account.user.decks || [Account.user.deck];
    const inUse = Account.user.deckIndex || 0;
    const tabs = [];
    for (let i = 0; i < DECK_SLOTS; i++) {
      const cls = [i === this.slot ? 'active' : '', i === inUse ? 'in-use' : '', decks[i] ? '' : 'empty'].join(' ');
      const title = decks[i] ? (i === inUse ? 'Deck em uso' : 'Usar este deck') : 'Espaço vazio';
      tabs.push(`<button data-slot="${i}" class="${cls}" title="${title}">${i === inUse ? '⚔️ ' : ''}${i + 1}</button>`);
    }
    this.el('#deck-tabs').innerHTML = tabs.join('');
  }

  // Tocar num deck salvo passa a usar ele; num espaço vazio, começa um deck novo (cópia do atual)
  // Sem aviso: o deck atual é salvo sozinho (se estiver completo) ou fica guardado aqui até voltar a ele
  async selectSlot(i) {
    if (i === this.slot) return;
    const leaving = this.slot;
    this.flushSave();
    if (this.isDirty()) this.pendingDrafts[leaving] = [...this.draft]; // incompleto
    const saved = this.savedDeck(i);
    const pending = this.pendingDrafts[i];
    delete this.pendingDrafts[i];
    const draft = pending || saved || [...this.draft];
    this.slot = i;
    this.focused = null;
    this.baseline = JSON.stringify(saved || (pending ? [] : draft));
    this.setDraft([...draft]);
    if (!saved) {
      this.flash(`Deck ${i + 1}: começou como cópia. Troque os Pokémon e ele é salvo sozinho.`, true);
      return;
    }
    if (i === Account.user.deckIndex) return;
    await this.saving;
    if (this.slot !== i) return;
    try {
      await Account.api('deck-select', { slot: i });
      this.flash(`Agora você batalha com o deck ${i + 1}.`, true);
    } catch (err) {
      this.flash(err.message);
    }
    this.renderTabs();
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
    if (c.arena !== undefined) return { key: 'arena', label: `🔒 Vença ${ARENAS[c.arena].leader} (${ARENAS[c.arena].short})` };
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
    const how = c.free ? 'Grátis.' : c.arena !== undefined ? `Conquistado ao vencer ${ARENAS[c.arena].leader} (${ARENAS[c.arena].name}).` : `Vendido na Loja por 🪙 ${c.fichas}.`;
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
    await this.flushSave();
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

  // ---------- Arrastar cartas (como no Clash Royale) ----------
  // Coleção -> espaço do deck: entra (ou substitui a carta daquele espaço).
  // Deck -> outro espaço: troca de lugar. Deck -> fora do deck: sai.
  // No celular o arraste começa ao segurar a carta (assim a lista continua rolando normalmente).
  _initDrag() {
    const panel = this.el('.deck-panel');
    const slotsBox = this.el('#deck-slots');
    let press = null;
    let drag = null;

    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const slotAt = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      const slot = hit && hit.closest('#deck-slots > *');
      return slot ? [...slotsBox.children].indexOf(slot) : -1;
    };
    const overSlots = (x, y) => {
      const r = slotsBox.getBoundingClientRect();
      return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 16 && y <= r.bottom + 16;
    };
    const place = (x, y) => {
      drag.ghost.style.left = `${x}px`;
      drag.ghost.style.top = `${y}px`;
      const i = slotAt(x, y);
      [...slotsBox.children].forEach((el, k) => el.classList.toggle('drop-target', k === i));
      slotsBox.classList.toggle('drop-zone', overSlots(x, y));
    };
    const begin = (x, y) => {
      const { el } = press;
      const r = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.classList.remove('focused');
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      document.body.appendChild(ghost);
      el.classList.add('drag-source');
      drag = { ...press, ghost };
      cancelPress();
      document.body.classList.add('dragging-card');
      if (navigator.vibrate) navigator.vibrate(12);
      place(x, y);
    };
    const end = (drop, x, y) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      d.ghost.remove();
      d.el.classList.remove('drag-source');
      document.body.classList.remove('dragging-card');
      slotsBox.classList.remove('drop-zone');
      [...slotsBox.children].forEach((el) => el.classList.remove('drop-target'));
      this._swallowClick = true; // o toque que terminou o arraste não abre os detalhes
      setTimeout(() => (this._swallowClick = false), 50);
      if (drop) this._drop(d, slotAt(x, y), overSlots(x, y));
    };

    panel.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag) return;
      const el = e.target.closest('#deck-grid [data-card], #deck-slots [data-card]');
      if (!el) return;
      const from = el.closest('#deck-slots') ? 'slot' : 'grid';
      const id = el.dataset.card;
      if (from === 'grid' && !this.canUse(id)) return;
      const index = from === 'slot' ? [...slotsBox.children].indexOf(el) : -1;
      press = { el, id, from, index, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType !== 'mouse' };
      if (press.touch) {
        const p = press;
        p.timer = setTimeout(() => press === p && begin(p.x, p.y), 260);
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (drag) {
        if (e.pointerId === drag.pointerId) place(e.clientX, e.clientY);
        return;
      }
      if (!press || e.pointerId !== press.pointerId) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.touch) {
        if (moved > 10) cancelPress(); // está rolando a lista
      } else if (moved > 6) begin(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', (e) => {
      if (drag && e.pointerId === drag.pointerId) end(true, e.clientX, e.clientY);
      cancelPress();
    });
    window.addEventListener('pointercancel', () => {
      end(false);
      cancelPress();
    });
    // Arrastando: o dedo não rola a página nem abre o menu de "salvar imagem"
    document.addEventListener('touchmove', (e) => {
      if (drag) e.preventDefault();
    }, { passive: false });
    panel.addEventListener('contextmenu', (e) => {
      if (drag || press) e.preventDefault();
    });
    panel.addEventListener('click', (e) => {
      if (!this._swallowClick) return;
      this._swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  _drop(d, slot, overSlots) {
    const draft = this.draft;
    const name = (id) => CARDS[id].name;
    if (d.from === 'grid') {
      const target = slot >= 0 ? draft[slot] : undefined;
      if (draft.includes(d.id)) {
        // Já está no deck: soltar em outro espaço só troca de lugar
        const at = draft.indexOf(d.id);
        if (slot >= 0 && slot < draft.length && slot !== at) [draft[at], draft[slot]] = [draft[slot], draft[at]];
      } else if (target) {
        draft[slot] = d.id;
        this.flash(`${name(d.id)} entrou no lugar de ${name(target)}.`, true);
      } else if ((slot >= 0 || overSlots) && draft.length < DECK_SIZE) {
        draft.push(d.id);
      } else if (slot >= 0 || overSlots) {
        this.flash('Deck cheio: solte em cima de um Pokémon para trocar.');
      }
    } else if (slot >= 0) {
      const to = Math.min(slot, draft.length - 1);
      [draft[d.index], draft[to]] = [draft[to], draft[d.index]];
    } else if (!overSlots) {
      draft.splice(d.index, 1);
      if (this.focused === d.id) this.focused = null;
    }
    this.renderAll();
  }

  _pick(e) {
    const el = e.target.closest('[data-card]');
    if (!el) return;
    // Tocar de novo na carta aberta fecha os detalhes
    this.focused = this.focused === el.dataset.card ? null : el.dataset.card;
    if (this.focused && this.account) markCardSeen(this.focused); // abriu a carta: some o selo "NOVO"
    this.renderInfo();
    this.renderGrid();
  }

  setDraft(deck) {
    this.draft = [...deck];
    this.renderAll();
  }

  renderAll() {
    this.renderTabs();
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
    const avg = n ? `Custo médio ${fmt(deckAverageCost(this.draft))}` : '';
    // Sem o botão Salvar (conta), o aviso de deck incompleto fica aqui
    const missing = this.account && n < DECK_SIZE ? `Faltam ${DECK_SIZE - n} · ` : '';
    this.el('#deck-avg').textContent = missing + avg;
    this.renderSaveButton();
    this.scheduleSave();
  }

  renderSaveButton() {
    const n = this.draft.length;
    const save = this.el('#deck-save');
    if (n !== DECK_SIZE) {
      save.disabled = true;
      save.textContent = `Faltam ${DECK_SIZE - n}`;
    } else if (this.account) {
      save.disabled = !this.isDirty();
      save.textContent = this.isDirty() ? 'Salvar' : 'Salvo ✓';
    } else {
      save.disabled = false;
      save.textContent = 'Salvar';
    }
  }

  _filtered() {
    const q = this.el('#deck-search').value.trim().toLowerCase();
    const type = this.el('#deck-type').value;
    const sort = this.el('#deck-sort').value;
    const list = Object.values(CARDS).filter((c) => {
      if (type === 'owned' && !Account.owns(c.id)) return false;
      if (type === 'spell' && c.kind !== 'spell') return false;
      if (type === 'building' && c.kind !== 'building') return false;
      if (type && !['spell', 'building', 'owned'].includes(type) && !(c.types || [c.type]).includes(type)) return false;
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
        if (isNewCard(c.id)) classes.push('is-new');
      }
    }
    return `<div class="${classes.join(' ')}" data-card="${c.id}" style="--type:${TYPE_COLORS[c.type]};--rarity:${RARITIES[rarityOf(c)].color}">${cardImgTag(c)}<div class="cost">${c.cost}</div>${extra}<div class="name">${c.name}</div></div>`;
  }

  renderInfo() {
    const box = this.el('#deck-info');
    const c = CARDS[this.focused];
    if (!c) {
      box.innerHTML = '<p class="hint">Toque num Pokémon para ver os detalhes, ou segure e arraste para o deck.</p>';
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
    } else if (c.kind === 'building') {
      const parts = [`❤️ ${Math.round(c.hp * mult)}`, `⏳ ${c.life} s`];
      if (c.dmg) parts.push(`⚔️ ${Math.round(c.dmg * mult)} a cada ${fmt(c.hitSpeed)} s`, `🎯 ${fmt(c.range)}`);
      if (c.heal) parts.push(`💚 +${Math.round(c.heal * mult)}/s · raio ${fmt(c.healRadius)}`);
      if (c.spawn) parts.push(`🦇 1 ${CARDS[c.spawn].name} a cada ${c.spawnEvery} s`);
      stats = parts.join(' · ');
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
