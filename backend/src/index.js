require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ZodError } = require("zod");
const { query, pool } = require("./db/pool");
const { requestId } = require("./middleware/observability");
const { metrics } = require("./services/metrics");
const { assertSafeConfig } = require("./config");
const { purgeExpiredAuthRecords, readSessionCookie } = require("./services/siweAuth");
const { MAX_BYTES } = require("./services/evidence");
const crypto = require("crypto");

const users = require("./routes/users");
const properties = require("./routes/properties");
const occupancy = require("./routes/occupancy");
const authority = require("./routes/authority");
const deals = require("./routes/deals");
const admin = require("./routes/admin");
const auth = require("./routes/auth");
const sso = require("./routes/sso");
const lookups = require("./routes/lookups");
const documents = require("./routes/documents");
const shares = require("./routes/shares");

const app = express();
const PORT = Number(process.env.PORT || 4000);

function parseTrustProxy(value) {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 120),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const nonceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.NONCE_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Base64 inflates uploads by 4/3; leave headroom for the JSON envelope.
const DOCUMENT_BODY_LIMIT = Math.ceil(MAX_BYTES * (4 / 3)) + 64 * 1024;

const TRUSTED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard: a state-changing request that authenticates with the session cookie (no explicit
 * Authorization header) must come from a trusted browser origin.
 */
function requireTrustedOriginForCookieAuth(req, res, next) {
  if (SAFE_METHODS.has(req.method) || req.header("authorization") || !readSessionCookie(req)) {
    return next();
  }
  if (TRUSTED_ORIGINS.includes(req.header("origin") || "")) return next();
  return res.status(403).json({ error: "Untrusted request origin", requestId: req.requestId });
}

app.use(helmet());
app.use(
  cors({
    origin: TRUSTED_ORIGINS,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-wallet-address"],
  })
);
app.use(requestId);
app.use(requireTrustedOriginForCookieAuth);
app.use(apiLimiter);
app.use("/api/documents", express.json({ limit: DOCUMENT_BODY_LIMIT }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({
      ok: true,
      product: "Zikkaron",
      country: "US",
      tagline: "A memorial layer that works with authorities — not instead of them.",
      notice:
        "Designed for collaboration with government and law enforcement. Not an official government system.",
      dependencies: { database: "up" },
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      product: "Zikkaron",
      country: "US",
      dependencies: { database: "down" },
      error: "Database unavailable",
      requestId: req.requestId,
    });
  }
});

function tokenMatches(provided, expected) {
  const a = crypto.createHash("sha256").update(String(provided || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

app.get("/metrics", (req, res) => {
  const configuredToken = process.env.METRICS_TOKEN;
  if (configuredToken && !tokenMatches(req.header("x-metrics-token"), configuredToken)) {
    return res.status(401).json({ error: "Metrics token required" });
  }
  res.json({ product: "Zikkaron", ...metrics.snapshot() });
});

app.use("/api/auth/nonce", nonceLimiter);
app.use("/api/auth", authLimiter, auth);
app.use("/api/auth/sso", authLimiter, sso);
app.use("/api/lookups", lookups);
app.use("/api/documents", documents);
app.use("/api/shares", shares);
app.use("/api/users", users);
app.use("/api/properties", properties);
app.use("/api/occupancy", occupancy);
app.use("/api/authority", authority);
app.use("/api/deals", deals);
app.use("/api/admin", admin);

const PG_CLIENT_ERRORS = {
  "23505": [409, "Conflict"],
  "22P02": [400, "Invalid identifier or value"],
  "23503": [404, "Referenced record not found"],
};

app.use((err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.errors,
      requestId: req.requestId,
    });
  }
  const pgError = PG_CLIENT_ERRORS[err.code];
  if (pgError) {
    return res.status(pgError[0]).json({ error: pgError[1], requestId: req.requestId });
  }
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({
      error: err.expose === false ? "Request error" : err.message,
      requestId: req.requestId,
    });
  }
  console.error(
    JSON.stringify({ event: "http.error", requestId: req.requestId, message: err.message, stack: err.stack })
  );
  res.status(500).json({ error: "Internal server error", requestId: req.requestId });
});

if (require.main === module) {
  assertSafeConfig();
  const server = app.listen(PORT, () => {
    console.log(`Zikkaron backend listening on :${PORT}`);
  });
  const cleanupMinutes = Number(process.env.AUTH_CLEANUP_INTERVAL_MINUTES ?? 60);
  const cleanupTimer =
    cleanupMinutes > 0
      ? setInterval(() => {
          purgeExpiredAuthRecords()
            .then((counts) => console.log(JSON.stringify({ event: "auth.cleanup", ...counts })))
            .catch((err) =>
              console.error(JSON.stringify({ event: "auth.cleanup_failed", message: err.message }))
            );
        }, cleanupMinutes * 60 * 1000)
      : null;
  cleanupTimer?.unref();
  const shutdown = async (signal) => {
    console.log(JSON.stringify({ event: "shutdown.start", signal }));
    if (cleanupTimer) clearInterval(cleanupTimer);
    server.close(async () => {
      await pool.end();
      console.log(JSON.stringify({ event: "shutdown.complete" }));
      process.exit(0);
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
