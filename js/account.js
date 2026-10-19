// Conta do jogador: chamadas à API (/api/<ação>) e o estado mais recente (coleção, troféus, balls...).
// O servidor é quem decide recompensas; aqui só mostramos o que ele devolve.

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const Account = {
  state: null, // resposta de /api/me quando logado
  available: true, // false quando o jogo roda sem servidor (ex.: arquivo aberto direto)
  clockOffset: 0, // relógio do servidor − relógio local (para os cronômetros das balls)

  async api(action, body) {
    let res;
    try {
      res = action === 'me'
        ? await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
        : await fetch(`/api/${action}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
    } catch {
      throw new ApiError('Sem conexão com o servidor. Verifique a internet.', 0);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // resposta sem JSON: não há servidor de contas aqui
    }
    if (!data) throw new ApiError('Servidor de contas indisponível.', res.status || 0);
    if (!res.ok) throw new ApiError(data.error || 'Erro no servidor.', res.status, data);
    if (data.collection && data.user) this._set(data);
    if (data.state) this._set(data.state);
    return data;
  },

  _set(state) {
    this.state = state;
    this.clockOffset = Date.parse(state.serverNow) - Date.now();
  },

  async refresh() {
    try {
      const data = await this.api('me');
      if (!data.user) this.state = null;
      this.available = true;
    } catch (err) {
      this.state = null;
      this.available = err.status !== 404 && err.status !== 0;
    }
    return this.state;
  },

  async logout() {
    try {
      await this.api('logout');
    } finally {
      this.state = null;
    }
  },

  get user() {
    return this.state && this.state.user;
  },

  get loggedIn() {
    return !!this.user;
  },

  now() {
    return Date.now() + this.clockOffset;
  },

  card(id) {
    return this.state ? this.state.collection[id] || null : null;
  },

  owns(id) {
    return !!this.card(id);
  },

  ownedIds() {
    return this.state ? Object.keys(this.state.collection) : [];
  },

  levelsFor(deck) {
    return Object.fromEntries(deck.map((id) => [id, this.card(id) ? this.card(id).level : undefined]));
  },
};
