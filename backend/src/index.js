require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ZodError } = require("zod");

const users = require("./routes/users");
const properties = require("./routes/properties");
const occupancy = require("./routes/occupancy");
const authority = require("./routes/authority");
const deals = require("./routes/deals");
const admin = require("./routes/admin");
const auth = require("./routes/auth");
const sso = require("./routes/sso");
const lookups = require("./routes/lookups");

const app = express();
const PORT = Number(process.env.PORT || 4000);
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

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    allowedHeaders: ["Content-Type", "Authorization", "x-wallet-address"],
  })
);
app.use(apiLimiter);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    product: "Zikkaron",
    country: "US",
    tagline: "A memorial layer that works with authorities — not instead of them.",
    notice:
      "Designed for collaboration with government and law enforcement. Not an official government system.",
    auth: {
      siwe: true,
      agencySsoStubs: true,
      headerFallback: process.env.ALLOW_HEADER_AUTH === "true",
    },
    govLookupAdapter: process.env.GOV_LOOKUP_ADAPTER || "simulated",
  });
});

app.use("/api/auth", authLimiter, auth);
app.use("/api/auth/sso", authLimiter, sso);
app.use("/api/lookups", lookups);
app.use("/api/users", users);
app.use("/api/properties", properties);
app.use("/api/occupancy", occupancy);
app.use("/api/authority", authority);
app.use("/api/deals", deals);
app.use("/api/admin", admin);

app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.errors });
  }
  if (err.code === "23505") {
    return res.status(409).json({ error: "Conflict", detail: err.detail });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zikkaron backend listening on :${PORT}`);
  });
}

module.exports = app;
