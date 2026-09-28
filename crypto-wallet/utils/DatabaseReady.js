// utils/DatabaseReady.js
//
// Coordinates DB readiness across modules.
//
// REQUIRED: call markDatabaseReady() after tables + migrations succeed in
// initDatabase() — do it BEFORE creating indexes so the UI unblocks early.
//
//   import { markDatabaseReady } from "./DatabaseReady";
//   export const initDatabase = async () => {
//     // ... schema creation + migrations ...
//     markDatabaseReady();   ← call here, before background work
//     createIndexes();       ← fire-and-forget after
//   };

// Tight timeout: any real device initialises SQLite well under 3 s.
// If this fires it means initDatabase() threw or never ran — both are bugs
// we want to surface quickly rather than let the user stare at a spinner.
const DB_TIMEOUT_MS = 3_000;

let _resolve = null;
let _settled = false;

export const databaseReady = new Promise((resolve) => {
  _resolve = resolve;

  setTimeout(() => {
    if (!_settled) {
      console.warn(
        "[DatabaseReady] ⚠️  markDatabaseReady() not called within " +
          `${DB_TIMEOUT_MS}ms — unblocking anyway. ` +
          "Check that initDatabase() completes and calls markDatabaseReady().",
      );
      _settled = true;
      resolve({ timedOut: true });
    }
  }, DB_TIMEOUT_MS);
});

/** Call once, immediately after schema + migrations succeed in initDatabase(). */
export const markDatabaseReady = () => {
  if (!_settled) {
    _settled = true;
    _resolve?.({ timedOut: false });
    _resolve = null;
  }
};

/** Awaitable used by any module that must wait for the DB before querying. */
export const waitForDatabase = () => databaseReady;
