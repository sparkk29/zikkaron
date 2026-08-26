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

async function verifySiweAndCreateSession({ message, signature }) {
  const siwe = new SiweMessage(message);
  const fields = await siwe.verify({ signature });
  const wallet = fields.data.address.toLowerCase();
  const nonce = fields.data.nonce;

  if (fields.data.domain !== DOMAIN) {
    throw Object.assign(new Error("SIWE domain mismatch"), { status: 401 });
  }
  if (Number(fields.data.chainId) !== CHAIN_ID) {
    throw Object.assign(new Error(`SIWE chainId must be ${CHAIN_ID} (Polygon Amoy)`), {
      status: 401,
    });
  }

  const nonceRow = await query(
    `SELECT * FROM auth_nonces
     WHERE nonce = $1 AND LOWER(wallet_address) = $2 AND consumed_at IS NULL AND expires_at > NOW()`,
    [nonce, wallet]
  );
  if (!nonceRow.rows[0]) {
    throw Object.assign(new Error("Invalid or expired nonce"), { status: 401 });
  }

  await query(`UPDATE auth_nonces SET consumed_at = NOW() WHERE id = $1`, [nonceRow.rows[0].id]);

  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await query(
    `INSERT INTO sessions (wallet_address, token_hash, auth_method, expires_at)
     VALUES ($1, $2, 'siwe', $3) RETURNING id, wallet_address, auth_method, expires_at, created_at`,
    [wallet, tokenHash, expiresAt]
  );

  return {
    token,
    session: session.rows[0],
    wallet,
  };
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

function extractBearer(req) {
  const h = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

module.exports = {
  createNonce,
  verifySiweAndCreateSession,
  getSessionByToken,
  revokeSession,
  extractBearer,
  DOMAIN,
  URI,
  CHAIN_ID,
};
