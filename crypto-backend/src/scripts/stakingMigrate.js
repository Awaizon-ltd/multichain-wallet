// scripts/migrate.js
// Usage: node scripts/migrate.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../config/pool");

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Track which migrations have run
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        run_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "../migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        "SELECT 1 FROM _migrations WHERE filename = $1",
        [file],
      );
      if (rowCount > 0) {
        console.log(`  ✓ Already ran: ${file}`);
        continue;
      }

      console.log(`  ⟳ Running: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [
        file,
      ]);
      console.log(`  ✓ Done: ${file}`);
    }

    console.log("\n✅ All migrations complete.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
