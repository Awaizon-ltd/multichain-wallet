// jobs/syncJob.js
"use strict";

const cron = require("node-cron");
const { syncNewPools, syncAllPools } = require("../services/poolSyncService");

let running = false;

async function runSync(label = "incremental") {
  if (running) {
    console.log(`[syncJob] Skipping — previous sync still running`);
    return;
  }
  running = true;
  console.log(`[syncJob] Starting ${label} sync — ${new Date().toISOString()}`);
  try {
    const result =
      label === "full" ? await syncAllPools() : await syncNewPools();
    console.log(`[syncJob] ✓ Done — ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[syncJob] ✗ Error — ${err.message}`);
  } finally {
    running = false;
  }
}

function startSyncJob() {
  // Incremental sync every 2 minutes
  cron.schedule("*/2 * * * *", () => runSync("incremental"));

  // Full resync once daily at 02:00 UTC to catch any drift
  cron.schedule("0 2 * * *", () => runSync("full"));

  console.log(
    "⏱  Pool sync job scheduled (incremental: 2min, full: 02:00 UTC daily)",
  );

  // Run immediately on start so the DB is populated before first request
  runSync("incremental");
}

module.exports = { startSyncJob, runSync };
