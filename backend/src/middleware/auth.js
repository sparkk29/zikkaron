/**
 * Auth middleware: prefer SIWE Bearer session; optional demo header fallback.
 * Header auth is spoofable — only when ALLOW_HEADER_AUTH=true (local/tests).
 */
const { getSessionByToken, extractBearer } = require("../services/siweAuth");

async function requireWallet(req, res, next) {
  try {
    const token = extractBearer(req);
    if (token) {
      const session = await getSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      req.wallet = session.wallet_address.toLowerCase();
      req.session = session;
      req.authMethod = session.auth_method;
      return next();
    }

    const allowHeader = process.env.ALLOW_HEADER_AUTH === "true";
    const wallet = (req.header("x-wallet-address") || "").trim().toLowerCase();
    if (allowHeader && /^0x[a-f0-9]{40}$/.test(wallet)) {
      req.wallet = wallet;
      req.authMethod = "header_fallback";
      return next();
    }

    return res.status(401).json({
      error: allowHeader
        ? "Missing Authorization Bearer session or x-wallet-address"
        : "Missing Authorization Bearer session — connect with SIWE (Sign-In with Ethereum)",
    });
  } catch (err) {
    next(err);
  }
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
      const isApprovedAdmin = user.role === "admin" && user.role_approved;
      const isApprovedRequestedRole = roles.includes(user.role) && user.role_approved;
      if (!isApprovedRequestedRole && !isApprovedAdmin) {
        return res.status(403).json({
          error: user.role_approved
            ? `Requires role: ${roles.join("|")}`
            : "This role is pending administrator approval",
          role: user.role,
          roleApproved: user.role_approved,
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
