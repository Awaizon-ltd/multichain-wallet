// controllers/stakingController.js
"use strict";

const db = require("../config/pool");
const { runSync } = require("../jobs/syncJob");
const { refreshActivePools } = require("../services/poolSyncService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit || "20", 10)),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function poolRow(row) {
  return {
    poolAddress: row.pool_address,
    stakingToken: row.staking_token,
    rewardToken: row.reward_token,
    poolOwner: row.pool_owner,
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    lockPeriodSecs: Number(row.lock_period),
    lockPeriodDays: Math.round(Number(row.lock_period) / 86400),
    paused: row.paused,
    isActive: row.is_active,
    isFunded: row.is_funded,
    totalStaked: row.total_staked.toString(),
    rewardPool: row.reward_pool.toString(),
    rewardRate: row.reward_rate.toString(),
    aprBps: row.apr_bps,
    aprPercent: (row.apr_bps / 100).toFixed(2),
    projectedAprBps: row.projected_apr_bps,
    projectedAprPercent: (row.projected_apr_bps / 100).toFixed(2), // "18.50"
    stakeFee: row.stake_fee,
    withdrawFee: row.withdraw_fee,
    emergencyPenalty: row.emergency_penalty,
    chainId: row.chain_id,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  };
}

// ─── GET /api/staking/pools ───────────────────────────────────────────────────
// Query params: page, limit, active (bool), owner (address), chainId
async function getPools(req, res, next) {
  try {
    const { page, limit, offset } = paginate(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(req.query.active === "true");
    }
    if (req.query.owner) {
      conditions.push(`pool_owner = $${idx++}`);
      params.push(req.query.owner.toLowerCase());
    }
    if (req.query.chainId) {
      conditions.push(`chain_id = $${idx++}`);
      params.push(parseInt(req.query.chainId, 10));
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [dataRes, countRes] = await Promise.all([
      db.query(
        `SELECT * FROM staking_pools ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      db.query(`SELECT COUNT(*) AS total FROM staking_pools ${where}`, params),
    ]);

    const total = parseInt(countRes.rows[0].total, 10);

    res.json({
      success: true,
      data: dataRes.rows.map(poolRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/staking/pools/:address ─────────────────────────────────────────
async function getPool(req, res, next) {
  try {
    const address = req.params.address.toLowerCase();
    const { rows } = await db.query(
      "SELECT * FROM staking_pools WHERE pool_address = $1",
      [address],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Pool not found" });
    }
    res.json({ success: true, data: poolRow(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/staking/pools/owner/:address ────────────────────────────────────
async function getPoolsByOwner(req, res, next) {
  try {
    const owner = req.params.address.toLowerCase();
    const { rows } = await db.query(
      "SELECT * FROM staking_pools WHERE pool_owner = $1 ORDER BY created_at DESC",
      [owner],
    );
    res.json({ success: true, data: rows.map(poolRow), total: rows.length });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/staking/stats ───────────────────────────────────────────────────
async function getStats(req, res, next) {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                        AS total_pools,
        COUNT(*) FILTER (WHERE is_active = true)        AS active_pools,
        COUNT(*) FILTER (WHERE is_funded = true)        AS funded_pools,
        COALESCE(SUM(total_staked), 0)                  AS total_tvl,
        COALESCE(AVG(apr_bps) FILTER (WHERE is_active), 0) AS avg_apr_bps
      FROM staking_pools
    `);
    const s = rows[0];
    res.json({
      success: true,
      data: {
        totalPools: parseInt(s.total_pools, 10),
        activePools: parseInt(s.active_pools, 10),
        fundedPools: parseInt(s.funded_pools, 10),
        totalTvl: s.total_tvl.toString(),
        avgAprBps: Math.round(parseFloat(s.avg_apr_bps)),
        avgAprPercent: (parseFloat(s.avg_apr_bps) / 100).toFixed(2),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/staking/sync  (admin-triggered manual sync) ───────────────────
async function triggerSync(req, res, next) {
  try {
    const type = req.query.type === "full" ? "full" : "incremental";
    // Fire and forget — respond immediately
    runSync(type).catch(console.error);
    res.json({ success: true, message: `${type} sync triggered` });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPools, getPool, getPoolsByOwner, getStats, triggerSync };
