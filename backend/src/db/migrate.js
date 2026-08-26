const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function migrate() {
  const dir = path.join(__dirname, "../../migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bootstrap: if core schema already exists from pre-tracker installs, mark 001 applied.
  const usersExist = await pool.query(`SELECT to_regclass('public.users') AS reg`);
  if (usersExist.rows[0]?.reg) {
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES ('001_init.sql') ON CONFLICT DO NOTHING`
    );
  }

  for (const file of files) {
    const already = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`,
      [file]
    );
    if (already.rows.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      await pool.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }
  console.log("Zikkaron migrations complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
