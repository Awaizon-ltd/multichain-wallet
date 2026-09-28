#!/usr/bin/env node
// scripts/migrate.js
// ─────────────────────────────────────────────────────────────────────────────
// Usage:
//   node scripts/migrate.js          → runs ALL UP migrations (default)
//   node scripts/migrate.js up       → runs ALL UP migrations
//   node scripts/migrate.js down     → rolls back ALL migrations (reverse order)
//   node scripts/migrate.js up 1     → runs only migration #1
//   node scripts/migrate.js down 2   → rolls back only migration #2
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

// ── Migration registry ────────────────────────────────────────────────────
// Add new migrations here in order. Never reorder or remove entries.
const MIGRATIONS = [
  {
    id: 1,
    label: "Wallet schema (users, wallet_chains, transaction_logs)",
    up: "001_create_wallet_schema.sql",
    down: "001_create_wallet_schema.rollback.sql",
    // Tables/views created by this migration — used for post-run verification
    verifyTables: ["users", "wallet_chains", "transaction_logs"],
    verifyViews: [],
  },
  {
    id: 2,
    label: "Swap tracking (swap_transactions, swap_leaderboard view)",
    up: "002_swap_transactions.sql",
    down: "002_swap_transactions.rollback.sql",
    verifyTables: ["swap_transactions"],
    verifyViews: ["swap_leaderboard"],
  },
  {
    id: 3,
    label: "Banners (moved from MongoDB)",
    up: "003_banners.sql",
    down: "003_banners.rollback.sql",
    verifyTables: ["banners"],
    verifyViews: [],
  },
];

// ── CLI args ──────────────────────────────────────────────────────────────
const DIRECTION = (process.argv[2] || "up").toLowerCase();
const TARGET_ID = process.argv[3] ? parseInt(process.argv[3], 10) : null; // optional

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// ── Colour helpers ────────────────────────────────────────────────────────
const colours = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};
const c = (col, txt) => `${colours[col]}${txt}${colours.reset}`;
const log = (sym, col, lbl, msg) =>
  console.log(
    `${c("dim", new Date().toISOString())}  ${c(col, sym)}  ${c("bold", lbl)} ${msg}`,
  );
const info = (l, m) => log("●", "cyan", l, m);
const ok = (l, m) => log("✔", "green", l, m);
const fail = (l, m) => log("✖", "red", l, m);
const warn = (l, m) => log("⚠", "yellow", l, m);
const sep = () => console.log(c("dim", "─".repeat(72)));

// ── Validate inputs ───────────────────────────────────────────────────────
function validateInputs() {
  sep();
  info(
    "INIT",
    `Direction: ${c("cyan", DIRECTION.toUpperCase())}${TARGET_ID ? `  (migration #${TARGET_ID} only)` : "  (all migrations)"}`,
  );

  if (!["up", "down"].includes(DIRECTION)) {
    fail("INIT", `Unknown direction "${DIRECTION}". Use: up | down`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    fail("CONFIG", "DATABASE_URL is not set in your environment / .env file");
    process.exit(1);
  }

  // Resolve which migrations to run
  let selected = MIGRATIONS;
  if (TARGET_ID !== null) {
    selected = MIGRATIONS.filter((m) => m.id === TARGET_ID);
    if (!selected.length) {
      fail(
        "CONFIG",
        `No migration with id=${TARGET_ID}. Valid ids: ${MIGRATIONS.map((m) => m.id).join(", ")}`,
      );
      process.exit(1);
    }
  }

  // Reverse order for rollbacks
  if (DIRECTION === "down") selected = [...selected].reverse();

  // Verify SQL files exist
  for (const m of selected) {
    const file = path.join(MIGRATIONS_DIR, DIRECTION === "up" ? m.up : m.down);
    if (!fs.existsSync(file)) {
      fail("CONFIG", `Migration file not found:\n         ${file}`);
      process.exit(1);
    }
    ok("CONFIG", `#${m.id} → ${c("dim", DIRECTION === "up" ? m.up : m.down)}`);
  }

  return selected;
}

// ── Test DB connection ────────────────────────────────────────────────────
async function testConnection(client) {
  sep();
  info("DB", "Testing connection …");
  try {
    const v = await client.query("SELECT version()");
    const dbVersion = v.rows[0].version.split(" ").slice(0, 2).join(" ");
    const p = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port()",
    );
    const {
      current_database,
      current_user,
      inet_server_addr,
      inet_server_port,
    } = p.rows[0];
    ok("DB", "Connected successfully");
    info(
      "DB",
      `Server:   ${c("cyan", `${inet_server_addr || "localhost"}:${inet_server_port || 5432}`)}`,
    );
    info("DB", `Database: ${c("cyan", current_database)}`);
    info("DB", `User:     ${c("cyan", current_user)}`);
    info("DB", `Version:  ${c("dim", dbVersion)}`);
  } catch (err) {
    fail("DB", `Connection failed: ${err.message}`);
    throw err;
  }
}

// ── Safety check for DOWN ─────────────────────────────────────────────────
async function confirmDown(client, selected) {
  if (DIRECTION !== "down") return;
  sep();
  warn("SAFETY", "You are about to run a ROLLBACK migration.");
  warn(
    "SAFETY",
    `This will DROP: ${selected.flatMap((m) => m.verifyTables).join(", ")}`,
  );

  // Warn if users table has rows
  try {
    const res = await client.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'`,
    );
    if (res.rows[0].count > 0) {
      const userCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM users",
      );
      if (userCount.rows[0].count > 0) {
        warn(
          "SAFETY",
          `users table has ${c("red", userCount.rows[0].count)} row(s) that will be permanently deleted.`,
        );
      }
    }
  } catch {
    // table might not exist yet
  }
}

// ── Run one migration file ────────────────────────────────────────────────
async function runOne(client, migration) {
  const filename = DIRECTION === "up" ? migration.up : migration.down;
  const file = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(file, "utf8");

  sep();
  info("MIGRATE", `#${migration.id} — ${migration.label}`);
  info("MIGRATE", `File: ${c("dim", filename)}`);
  info("MIGRATE", `Statements: ${(sql.match(/;/g) || []).length}`);

  const start = Date.now();
  await client.query(sql);
  ok("MIGRATE", `Done in ${c("cyan", `${Date.now() - start}ms`)}`);
}

// ── Verify schema (UP only) ───────────────────────────────────────────────
async function verifyAll(client, selected) {
  if (DIRECTION !== "up") return;
  sep();
  info("VERIFY", "Checking created objects …");

  const allTables = selected.flatMap((m) => m.verifyTables);
  const allViews = selected.flatMap((m) => m.verifyViews);

  if (allTables.length) {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [allTables],
    );
    const found = res.rows.map((r) => r.table_name);
    allTables.forEach((t) =>
      found.includes(t)
        ? ok("VERIFY", `Table:  ${c("cyan", t)}`)
        : fail("VERIFY", `Table MISSING: ${t}`),
    );
  }

  if (allViews.length) {
    const res = await client.query(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [allViews],
    );
    const found = res.rows.map((r) => r.table_name);
    allViews.forEach((v) =>
      found.includes(v)
        ? ok("VERIFY", `View:   ${c("cyan", v)}`)
        : fail("VERIFY", `View MISSING: ${v}`),
    );
  }

  // Index count
  const allTableNames = [...allTables];
  if (allTableNames.length) {
    const idxRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [allTableNames],
    );
    info(
      "VERIFY",
      `Total indexes across migrated tables: ${c("cyan", idxRes.rows[0].count)}`,
    );
  }

  // blockchain_chain enum (migration #1 specific)
  if (selected.some((m) => m.id === 1)) {
    try {
      const enumRes = await client.query(
        `SELECT enumlabel FROM pg_enum
         JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
         WHERE pg_type.typname = 'blockchain_chain' ORDER BY enumlabel`,
      );
      info(
        "VERIFY",
        `blockchain_chain enum: ${c("dim", enumRes.rows.map((r) => r.enumlabel).join(", "))}`,
      );
    } catch {
      // enum may not exist if migration 1 was skipped
    }
  }

  // swap_transactions row count (migration #2 specific)
  if (selected.some((m) => m.id === 2)) {
    try {
      const cntRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM swap_transactions",
      );
      info(
        "VERIFY",
        `swap_transactions rows: ${c("cyan", cntRes.rows[0].count)} (0 expected on fresh install)`,
      );
    } catch {
      // table may not have been created if something went wrong
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(c("bold", "  Crypto Wallet Binder — Database Migration Runner"));
  console.log();

  const selected = validateInputs();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8_000,
  });

  try {
    await client.connect();
    await testConnection(client);
    await confirmDown(client, selected);

    for (const migration of selected) {
      await runOne(client, migration);
    }

    await verifyAll(client, selected);

    sep();
    ok(
      "DONE",
      c("green", `Migration ${DIRECTION.toUpperCase()} finished successfully.`),
    );

    // Summary
    const labels = selected.map((m) => `#${m.id}`).join(", ");
    info("DONE", `Ran migration(s): ${c("cyan", labels)}`);
    console.log();
    process.exit(0);
  } catch (err) {
    sep();
    fail("FATAL", err.message);
    if (process.env.DEBUG) console.error(err);
    console.log();
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
