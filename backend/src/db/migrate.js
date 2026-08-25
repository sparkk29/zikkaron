const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function migrate() {
  const sqlPath = path.join(__dirname, "../../migrations/001_init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  console.log("Zikkaron schema applied.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
