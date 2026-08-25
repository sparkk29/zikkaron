/**
 * Demo-only wallet auth via x-wallet-address header.
 * Spoofable — future: SIWE + authority SSO. Documented in docs/flaw.md.
 */
async function requireWallet(req, res, next) {
  const wallet = (req.header("x-wallet-address") || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(401).json({
      error: "Missing or invalid x-wallet-address header (demo auth only)",
    });
  }
  req.wallet = wallet;
  next();
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const { query } = require("../db/pool");
      const result = await query(
        "SELECT * FROM users WHERE LOWER(wallet_address) = $1",
        [req.wallet]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: "User not registered" });
      }
      const user = result.rows[0];
      if (!roles.includes(user.role) && user.role !== "admin") {
        return res.status(403).json({
          error: `Requires role: ${roles.join("|")}`,
          role: user.role,
        });
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireWallet, requireRole };
