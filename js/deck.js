// Editor de deck: escolhe 8 cartas entre os 151 Pokémon e os golpes. O deck fica salvo no navegador.

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

class DeckEditor {
  constructor(onClose) {
    this.onClose = onClose;
    this.el = (sel) => document.querySelector(sel);
    this.draft = [];
    this.focused = null;

    const typeSel = this.el('#deck-type');
    typeSel.innerHTML = '<option value="">Todos os tipos</option>'
      + Object.keys(TYPE_NAMES).map((t) => `<option value="${t}">${TYPE_NAMES[t]}</option>`).join('')
      + '<option value="spell">Golpes</option>';

    this.el('#deck-search').addEventListener('input', () => this.renderGrid());
    typeSel.addEventListener('change', () => this.renderGrid());
    this.el('#deck-sort').addEventListener('change', () => this.renderGrid());
    this.el('#deck-random').addEventListener('click', () => this.setDraft(randomDeck()));
    this.el('#deck-default').addEventListener('click', () => this.setDraft([...DEFAULT_DECK]));
    this.el('#deck-close').addEventListener('click', () => this.onClose(false));
    this.el('#deck-save').addEventListener('click', () => {
      if (!isValidDeck(this.draft)) return;
      saveDeck(this.draft);
      this.onClose(true);
    });
    this.el('#deck-grid').addEventListener('click', (e) => this._pick(e));
    this.el('#deck-slots').addEventListener('click', (e) => this._pick(e));
    this.el('#deck-info').addEventListener('click', (e) => {
      if (e.target.id === 'deck-toggle') this.toggle(this.focused);
    });
  }

  open() {
    this.setDraft(loadDeck());
    this.focused = null;
    this.renderInfo();
  }

  _pick(e) {
    const el = e.target.closest('[data-card]');
    if (!el) return;
    this.focused = el.dataset.card;
    this.renderInfo();
    this.renderGrid();
  }

  setDraft(deck) {
    this.draft = [...deck];
    this.renderSlots();
    this.renderGrid();
    this.renderInfo();
  }

  toggle(id) {
    if (!id) return;
    const i = this.draft.indexOf(id);
    if (i >= 0) this.draft.splice(i, 1);
    else if (this.draft.length < DECK_SIZE) this.draft.push(id);
    this.renderSlots();
    this.renderGrid();
    this.renderInfo();
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
    let list = Object.values(CARDS).filter((c) => {
      if (type === 'spell' && c.kind !== 'spell') return false;
      if (type && type !== 'spell' && !(c.types || [c.type]).includes(type)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || String(c.dex || '') === q.replace('#', '');
    });
    const dexOf = (c) => c.dex || 999;
    if (sort === 'cost') list.sort((a, b) => a.cost - b.cost || dexOf(a) - dexOf(b));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    else list.sort((a, b) => dexOf(a) - dexOf(b));
    return list;
  }

  renderGrid() {
    this.el('#deck-grid').innerHTML = this._filtered().map((c) => this._cardHTML(c, 'small')).join('');
  }

  _cardHTML(c, size, inSlot = false) {
    const classes = ['card', size];
    if (!inSlot && this.draft.includes(c.id)) classes.push('in-deck');
    if (this.focused === c.id) classes.push('focused');
    const dexNo = c.dex ? `<span class="dexno">#${c.dex}</span>` : '';
    return `<div class="${classes.join(' ')}" data-card="${c.id}" style="--type:${TYPE_COLORS[c.type]}">${cardImgTag(c)}<div class="cost">${c.cost}</div>${dexNo}<div class="name">${c.name}</div></div>`;
  }

  renderInfo() {
    const box = this.el('#deck-info');
    const c = CARDS[this.focused];
    if (!c) {
      box.innerHTML = '<p class="hint">Toque numa carta para ver os detalhes.</p>';
      return;
    }
    const inDeck = this.draft.includes(c.id);
    const full = this.draft.length >= DECK_SIZE;
    const btn = inDeck
      ? '<button id="deck-toggle">Remover</button>'
      : `<button id="deck-toggle" class="primary" ${full ? 'disabled' : ''}>${full ? 'Deck cheio' : 'Adicionar'}</button>`;
    let stats;
    if (c.kind === 'spell') {
      stats = `💥 ${c.dmg} de dano · raio ${fmt(c.radius)} · ${Math.round(c.towerMult * 100)}% nos ginásios`;
    } else {
      const each = c.count ? ` (×${c.count})` : '';
      stats = `❤️ ${c.hp}${each} · ⚔️ ${c.dmg} a cada ${fmt(c.hitSpeed)} s · 🎯 ${c.range > 1.5 ? fmt(c.range) : 'corpo a corpo'} · 👟 ${speedLabel(c.speed)}`;
    }
    const types = (c.types || [c.type]).map(typeChip).join('');
    const atk = c.kind === 'unit' && !c.types.includes(c.type) ? ` · ataque ${TYPE_NAMES[c.type]}` : '';
    box.innerHTML = `
      ${cardImgTag(c)}
      <div class="info-body">
        <h3>${c.name} ${c.dex ? `<small>#${c.dex}</small>` : ''} ${types}</h3>
        <div class="stats">⚡ ${c.cost} de energia${atk} · ${stats}</div>
        <div class="desc">${c.desc}</div>
      </div>
      ${btn}`;
  }
}
