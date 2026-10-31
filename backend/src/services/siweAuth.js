const crypto = require("crypto");
const { SiweMessage } = require("siwe");
const { query } = require("../db/pool");

const DOMAIN = process.env.SIWE_DOMAIN || "localhost";
const URI = process.env.SIWE_URI || "http://localhost:3000";
const CHAIN_ID = Number(process.env.SIWE_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 80002);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);
const NONCE_TTL_MINUTES = Number(process.env.NONCE_TTL_MINUTES || 10);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createNonce(walletAddress) {
  const wallet = walletAddress.toLowerCase();
  const nonce = randomToken().slice(0, 32);
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);
  await query(
    `INSERT INTO auth_nonces (wallet_address, nonce, expires_at) VALUES ($1, $2, $3)`,
    [wallet, nonce, expiresAt]
  );
  return {
    nonce,
    expiresAt,
    domain: DOMAIN,
    uri: URI,
    chainId: CHAIN_ID,
    statement:
      "Sign in to Zikkaron. This proves wallet control for a session. Not a transaction. Not title. Not an official government system.",
  };
}

async function createSession(wallet, authMethod) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await query(
    `INSERT INTO sessions (wallet_address, token_hash, auth_method, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id, wallet_address, auth_method, expires_at, created_at`,
    [wallet, hashToken(token), authMethod, expiresAt]
  );
  return { token, session: session.rows[0] };
}

function siweUnauthorized(message) {
  return Object.assign(new Error(message), { status: 401 });
}

async function verifySiweAndCreateSession({ message, signature }) {
  let fields;
  try {
    const siwe = new SiweMessage(message);
    fields = await siwe.verify({ signature });
  } catch (err) {
    const reason = err?.error?.type || err?.message || "invalid message or signature";
    throw siweUnauthorized(`SIWE verification failed: ${reason}`);
  }
  const wallet = fields.data.address.toLowerCase();
  const nonce = fields.data.nonce;

  if (fields.data.domain !== DOMAIN) {
    throw siweUnauthorized("SIWE domain mismatch");
  }
  if (fields.data.uri !== URI) {
    throw siweUnauthorized("SIWE uri mismatch");
  }
  if (Number(fields.data.chainId) !== CHAIN_ID) {
    throw siweUnauthorized(`SIWE chainId must be ${CHAIN_ID} (Polygon Amoy)`);
  }

  const consumed = await query(
    `UPDATE auth_nonces SET consumed_at = NOW()
     WHERE nonce = $1 AND LOWER(wallet_address) = $2 AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [nonce, wallet]
  );
  if (!consumed.rows[0]) {
    throw siweUnauthorized("Invalid or expired nonce");
  }

  const { token, session } = await createSession(wallet, "siwe");
  return { token, session, wallet };
}

async function getSessionByToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT * FROM sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  const session = result.rows[0];
  if (!session) return null;
  await query(`UPDATE sessions SET last_seen_at = NOW() WHERE id = $1`, [session.id]);
  return session;
}

async function revokeSession(token) {
  if (!token) return;
  await query(
    `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)]
  );
}

/** Delete nonces past expiry and sessions that expired or were revoked over a day ago. */
async function purgeExpiredAuthRecords() {
  const nonces = await query(`DELETE FROM auth_nonces WHERE expires_at <= NOW()`);
  const sessions = await query(
    `DELETE FROM sessions
     WHERE expires_at <= NOW() - INTERVAL '1 day'
        OR revoked_at <= NOW() - INTERVAL '1 day'`
  );
  return { noncesDeleted: nonces.rowCount, sessionsDeleted: sessions.rowCount };
}

const SESSION_COOKIE = "zikkaron_session";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.SESSION_COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false"),
    path: "/",
  };
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: new Date(expiresAt) });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

function readSessionCookie(req) {
  const header = req.header("cookie") || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function extractBearer(req) {
  const h = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Bearer header (API clients/tests) takes precedence over the browser session cookie. */
function extractSessionToken(req) {
  return extractBearer(req) || readSessionCookie(req);
}

module.exports = {
  createNonce,
  createSession,
  hashToken,
  verifySiweAndCreateSession,
  getSessionByToken,
  revokeSession,
  purgeExpiredAuthRecords,
  extractBearer,
  extractSessionToken,
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  DOMAIN,
  URI,
  CHAIN_ID,
};
