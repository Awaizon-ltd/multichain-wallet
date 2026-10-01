// middleware/rateLimiter.js
// Uses express-rate-limit to protect expensive RPC-calling endpoints.
// Install: npm install express-rate-limit

const rateLimit = require("express-rate-limit");

/**
 * General API rate limiter — 60 requests per minute per IP.
 * Applied to all bridge endpoints that hit the RPC.
 */
const rateLimiter = rateLimit({
  windowMs:         60 * 1000,   // 1 minute
  max:              60,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    error:   "Too many requests. Please wait a moment before trying again.",
  },
  skip: (req) => {
    // Skip rate limiting in test environments
    return process.env.NODE_ENV === "test";
  },
});

module.exports = { rateLimiter };