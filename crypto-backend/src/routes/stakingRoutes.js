// routes/stakingRoutes.js
"use strict";

const router = require("express").Router();
const ctrl = require("../controllers/stakingController");

// Pool listing with filters + pagination
router.get("/pools", ctrl.getPools);

// Stats summary
router.get("/stats", ctrl.getStats);

// Single pool by address
router.get("/pools/:address", ctrl.getPool);

// All pools by owner/creator
router.get("/pools/owner/:address", ctrl.getPoolsByOwner);

// Manual sync trigger (protect with API key middleware in production)
router.post("/sync", ctrl.triggerSync);

module.exports = router;
