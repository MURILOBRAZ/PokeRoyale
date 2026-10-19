// Multiplayer P2P via PeerJS (WebRTC). O servidor público do PeerJS só apresenta os
// dois navegadores; depois disso os dados vão direto de um para o outro.
//
// Protocolo (JSON):
//   anfitrião -> convidado: {t:'start'} | {t:'snap', s:snapshot, ev:[eventos]} | {t:'full'}
//   convidado -> anfitrião: {t:'deploy', i, x, y}

const ROOM_PREFIX = 'pokeroyale-v1-';
const ROOM_WORDS = ['PIKA', 'CHAR', 'BULB', 'SQUI', 'EEVE', 'ONIX', 'ZUBA', 'MEW', 'SNOR', 'GENG', 'JIGG', 'ABRA', 'MACH', 'VULP', 'DITT', 'LAPR'];

function makeRoomCode() {
  const word = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
  return word + String(Math.floor(Math.random() * 90) + 10);
}

function normalizeCode(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatCode(code) {
  return code.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
}

const NET_ERRORS = {
  'peer-unavailable': 'Sala não encontrada. Confira o código.',
  network: 'Sem conexão com o servidor. Verifique a internet.',
  'server-error': 'O servidor de salas está fora do ar. Tente de novo.',
  'socket-error': 'Sem conexão com o servidor. Verifique a internet.',
  'browser-incompatible': 'Este navegador não suporta o multiplayer.',
};

class Net {
  // handlers: onRoom(code), onConnect(), onData(msg), onClose(), onError(text)
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
  }

  host(attempt = 0) {
    this.isHost = true;
    const code = makeRoomCode();
    this.peer = new Peer(ROOM_PREFIX + code);
    this.peer.on('open', () => this.h.onRoom(code));
    this.peer.on('connection', (conn) => {
      if (this.conn) {
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this._bind(conn);
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) {
        this.peer.destroy();
        this.host(attempt + 1);
      } else {
        this._error(err);
      }
    });
  }

  join(code) {
    this.isHost = false;
    this.peer = new Peer();
    this.peer.on('open', () => {
      this._bind(this.peer.connect(ROOM_PREFIX + code, { serialization: 'json', reliable: true }));
    });
    this.peer.on('error', (err) => this._error(err));
  }

  _bind(conn) {
    this.conn = conn;
    conn.on('open', () => this.h.onConnect());
    conn.on('data', (msg) => this.h.onData(msg));
    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.conn = null;
      this.h.onClose();
    });
  }

  _error(err) {
    this.h.onError(NET_ERRORS[err.type] || `Erro de conexão (${err.type || err.message}).`);
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    if (peer) peer.destroy();
  }
}
