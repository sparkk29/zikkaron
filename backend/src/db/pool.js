const { Pool } = require("pg");

const LOCAL_DEV_DATABASE_URL = "postgresql://zikkaron:zikkaron@localhost:5432/zikkaron";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? undefined : LOCAL_DEV_DATABASE_URL),
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
