const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err);
});

module.exports = pool;
