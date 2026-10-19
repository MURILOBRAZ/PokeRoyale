// Senhas (scrypt com sal) e sessões em cookie httpOnly. O banco guarda só o hash do token da sessão.

const crypto = require('crypto');
const { q, one } = require('./db');

const COOKIE = 'pr_session';
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, SESSION_DAYS],
  );
  // Aproveita para limpar sessões vencidas desse usuário
  await q('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [userId]);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  setSessionCookie(res, '', 0);
}

// Ao trocar a senha: encerra as sessões dos outros aparelhos, mantém a atual
async function destroyOtherSessions(req, userId) {
  const token = readCookie(req, COOKIE);
  await q('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, token ? sha256(token) : '']);
}

async function currentUserId(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = await one('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [sha256(token)]);
  return row ? row.user_id : null;
}

module.exports = { hashPassword, verifyPassword, createSession, destroySession, destroyOtherSessions, currentUserId };
