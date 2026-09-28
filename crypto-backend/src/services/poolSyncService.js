// services/poolSyncService.js
"use strict";

const { ethers } = require("ethers");
const db = require("../config/pool");
const FACTORY_ABI = require("../abis/stakingAbi");

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "1", 10);
const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || "50", 10);

if (!FACTORY_ADDRESS) throw new Error("FACTORY_ADDRESS is not set in .env");
if (!RPC_URL) throw new Error("RPC_URL is not set in .env");

// ─── Network map — pass chain explicitly so ethers skips auto-detection ────────
// NETWORK_ERROR is almost always caused by ethers calling eth_chainId on startup
// and the RPC timing out before responding.
const NETWORK_MAP = {
  1: { name: "homestead", chainId: 1 },
  137: { name: "matic", chainId: 137 },
  10: { name: "optimism", chainId: 10 },
  42161: { name: "arbitrum", chainId: 42161 },
  8453: { name: "base", chainId: 8453 },
  84532: { name: "base-sepolia", chainId: 84532 },
  5000: { name: "mantle", chainId: 5000 },
  5003: { name: "mantle-sepolia", chainId: 5003 },
};

function getNetwork() {
  const net = NETWORK_MAP[CHAIN_ID];
  if (!net) {
    console.warn(
      `[syncService] Unknown CHAIN_ID ${CHAIN_ID} — ethers will auto-detect network. ` +
        `Add it to NETWORK_MAP to avoid NETWORK_ERROR on slow RPCs.`,
    );
    return undefined; // ethers will try to detect — may time out on slow RPCs
  }
  return net;
}

// ─── Provider — explicit network prevents the NETWORK_ERROR ──────────────────
function getProvider() {
  const network = getNetwork();

  // Pass the network object as the second argument to skip eth_chainId detection
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, network);

  // Raise the polling interval — avoids hammering the RPC between requests
  provider.pollingInterval = 8000;

  return provider;
}

function getFactory(provider) {
  return new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
}

// ─── Retry wrapper — RPC calls sometimes fail transiently ─────────────────────
async function withRetry(fn, retries = 3, delayMs = 2000) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(
        `[syncService] Attempt ${i + 1}/${retries} failed: ${err.message}`,
      );
      if (i < retries - 1) await sleep(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Map on-chain PoolInfo tuple → DB row ─────────────────────────────────────
function mapPoolInfo(info) {
  return {
    pool_address: info.poolAddress.toLowerCase(),
    staking_token: info.stakingToken.toLowerCase(),
    reward_token: info.rewardToken.toLowerCase(),
    pool_owner: info.poolOwner.toLowerCase(),
    start_time: info.startTime.toString(),
    end_time: info.endTime.toString(),
    lock_period: info.lockPeriod.toString(),
    paused: info.paused,
    is_active: info.isActive,
    is_funded: info.isFunded,
    total_staked: info.totalStaked.toString(),
    reward_pool: info.rewardPool.toString(),
    reward_rate: info.rewardRate.toString(),
    apr_bps: Number(info.aprBps),
    projected_apr_bps: Number(info.projectedAprBps),
    stake_fee: Number(info.stakeFee),
    withdraw_fee: Number(info.withdrawFee),
    emergency_penalty: Number(info.emergencyPenalty),
    chain_id: CHAIN_ID,
    last_synced_at: new Date(),
  };
}

// ─── Upsert batch — idempotent ────────────────────────────────────────────────
async function upsertPools(pools) {
  if (pools.length === 0) return 0;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const p of pools) {
      await client.query(
        `INSERT INTO staking_pools (
           pool_address, staking_token, reward_token, pool_owner,
           start_time, end_time, lock_period,
           paused, is_active, is_funded,
           total_staked, reward_pool, reward_rate, apr_bps, projected_apr_bps,
           stake_fee, withdraw_fee, emergency_penalty,
           chain_id, last_synced_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         )
         ON CONFLICT (pool_address) DO UPDATE SET
           staking_token     = EXCLUDED.staking_token,
           reward_token      = EXCLUDED.reward_token,
           pool_owner        = EXCLUDED.pool_owner,
           start_time        = EXCLUDED.start_time,
           end_time          = EXCLUDED.end_time,
           lock_period       = EXCLUDED.lock_period,
           paused            = EXCLUDED.paused,
           is_active         = EXCLUDED.is_active,
           is_funded         = EXCLUDED.is_funded,
           total_staked      = EXCLUDED.total_staked,
           reward_pool       = EXCLUDED.reward_pool,
           reward_rate       = EXCLUDED.reward_rate,
           apr_bps           = EXCLUDED.apr_bps,
           projected_apr_bps = EXCLUDED.projected_apr_bps,
           stake_fee         = EXCLUDED.stake_fee,
           withdraw_fee      = EXCLUDED.withdraw_fee,
           emergency_penalty = EXCLUDED.emergency_penalty,
           chain_id          = EXCLUDED.chain_id,
           last_synced_at    = EXCLUDED.last_synced_at`,
        [
          p.pool_address,
          p.staking_token,
          p.reward_token,
          p.pool_owner,
          p.start_time,
          p.end_time,
          p.lock_period,
          p.paused,
          p.is_active,
          p.is_funded,
          p.total_staked,
          p.reward_pool,
          p.reward_rate,
          p.apr_bps,
          p.projected_apr_bps,
          p.stake_fee,
          p.withdraw_fee,
          p.emergency_penalty,
          p.chain_id,
          p.last_synced_at,
        ],
      );
    }

    await client.query("COMMIT");
    return pools.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Full sync ────────────────────────────────────────────────────────────────
async function syncAllPools() {
  const t0 = Date.now();
  const provider = getProvider();
  const factory = getFactory(provider);

  const totalBig = await withRetry(() => factory.poolCount());
  const total = Number(totalBig);

  if (total === 0) {
    return { synced: 0, total: 0, durationMs: Date.now() - t0 };
  }

  let synced = 0;
  let offset = 0;

  while (offset < total) {
    const infos = await withRetry(() =>
      factory.getPoolsInfo(offset, BATCH_SIZE),
    );
    const rows = infos.map(mapPoolInfo);
    const count = await upsertPools(rows);
    synced += count;
    offset += BATCH_SIZE;
    console.log(`  [sync] ${synced}/${total} pools upserted`);
  }

  return { synced, total, durationMs: Date.now() - t0 };
}

// ─── Incremental sync ─────────────────────────────────────────────────────────
async function syncNewPools() {
  const t0 = Date.now();
  const provider = getProvider();
  const factory = getFactory(provider);

  const totalBig = await withRetry(() => factory.poolCount());
  const total = Number(totalBig);

  const { rows } = await db.query(
    "SELECT COUNT(*) AS cnt FROM staking_pools WHERE chain_id = $1",
    [CHAIN_ID],
  );
  const dbCount = parseInt(rows[0].cnt, 10);

  if (dbCount >= total) {
    await refreshActivePools(provider);
    return {
      synced: 0,
      total,
      durationMs: Date.now() - t0,
      note: "refreshed active",
    };
  }

  const newCount = total - dbCount;
  const infos = await withRetry(() => factory.getPoolsInfo(dbCount, newCount));
  const rows2 = infos.map(mapPoolInfo);
  const synced = await upsertPools(rows2);

  await refreshActivePools(provider);

  return { synced, total, durationMs: Date.now() - t0 };
}

// ─── ABIs for getPoolInfo — two versions ──────────────────────────────────────
// New contracts (with projectedAprBps) — try this first
const POOL_ABI_V2 = [
  "function getPoolInfo() external view returns (tuple(" +
    "address poolAddress, address stakingToken, address rewardToken, address poolOwner, " +
    "uint256 startTime, uint256 endTime, uint256 lockPeriod, " +
    "bool paused, bool isActive, bool isFunded, " +
    "uint256 totalStaked, uint256 rewardPool, uint256 rewardRate, " +
    "uint256 aprBps, uint256 projectedAprBps, " +
    "uint256 stakeFee, uint256 withdrawFee, uint256 emergencyPenalty" +
    "))",
];

// Old contracts (without projectedAprBps) — fallback
const POOL_ABI_V1 = [
  "function getPoolInfo() external view returns (tuple(" +
    "address poolAddress, address stakingToken, address rewardToken, address poolOwner, " +
    "uint256 startTime, uint256 endTime, uint256 lockPeriod, " +
    "bool paused, bool isActive, bool isFunded, " +
    "uint256 totalStaked, uint256 rewardPool, uint256 rewardRate, " +
    "uint256 aprBps, " +
    "uint256 stakeFee, uint256 withdrawFee, uint256 emergencyPenalty" +
    "))",
];

// Fetch getPoolInfo from a single pool — tries new ABI, falls back to old ABI.
// Old contracts return 17 fields; new ones return 18 (adds projectedAprBps).
// ethers v5 throws CALL_EXCEPTION when the tuple field count doesn't match.
async function fetchPoolInfo(addr, provider) {
  // Try new ABI first
  try {
    const info = await new ethers.Contract(
      addr,
      POOL_ABI_V2,
      provider,
    ).getPoolInfo();
    return { ...info, projectedAprBps: info.projectedAprBps ?? 0 };
  } catch (_) {}

  // Fall back to old ABI — set projectedAprBps to 0 for legacy pools
  try {
    const info = await new ethers.Contract(
      addr,
      POOL_ABI_V1,
      provider,
    ).getPoolInfo();
    return { ...info, projectedAprBps: 0 };
  } catch (err) {
    throw err; // both ABIs failed — real error, let caller handle it
  }
}

// ─── Refresh active pools — re-reads TVL/APR for non-ended pools ──────────────
async function refreshActivePools(provider) {
  const _provider = provider || getProvider();

  const { rows } = await db.query(
    `SELECT pool_address FROM staking_pools
     WHERE chain_id = $1 AND end_time > EXTRACT(EPOCH FROM NOW())`,
    [CHAIN_ID],
  );

  if (rows.length === 0) return 0;

  const chunks = chunkArray(
    rows.map((r) => r.pool_address),
    BATCH_SIZE,
  );
  let refreshed = 0;

  for (const chunk of chunks) {
    const infos = await Promise.all(
      chunk.map((addr) =>
        // fetchPoolInfo tries V2 ABI (18 fields) then falls back to V1 (17 fields)
        // so old and new contracts are both handled without errors
        withRetry(() => fetchPoolInfo(addr, _provider)).catch((err) => {
          console.warn(
            `[syncService] Failed to refresh ${addr}: ${err.message}`,
          );
          return null;
        }),
      ),
    );

    const valid = infos.filter(Boolean).map(mapPoolInfo);
    if (valid.length > 0) {
      await upsertPools(valid);
      refreshed += valid.length;
    }
  }

  return refreshed;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

module.exports = { syncAllPools, syncNewPools, refreshActivePools };
