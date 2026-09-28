// utils/errors/humanizeError.js
// ─────────────────────────────────────────────────────────────────────────────
// One place that turns whatever an RPC provider, the backend, or a raw fetch()
// throws into { title, message } a user can actually act on. Every data-layer
// module (apiClient.js, the RPC/balance layer, bridge/swap hooks) should route
// its catch blocks through this instead of showing err.message directly.
//
// Never throws itself — worst case it falls through to a generic message.
// ─────────────────────────────────────────────────────────────────────────────

const RULES = [
  // ── Connectivity ──────────────────────────────────────────────────────────
  {
    test: (e) =>
      e.name === "AbortError" ||
      /aborted/i.test(e.message || "") ,
    result: {
      title: "Request Cancelled",
      message: "That request was cancelled before it finished.",
      type: "cancelled",
    },
  },
  {
    test: (e) =>
      /network request failed|failed to fetch|fetch failed/i.test(
        e.message || "",
      ) || e.code === "NETWORK_ERROR",
    result: {
      title: "No Connection",
      message: "Check your internet connection and try again.",
      type: "network",
    },
  },
  {
    test: (e) =>
      /timeout|timed out/i.test(e.message || "") || e.code === "ETIMEDOUT",
    result: {
      title: "Taking Too Long",
      message: "The network is slow to respond. Please try again.",
      type: "timeout",
    },
  },

  // ── Wallet / signing ──────────────────────────────────────────────────────
  {
    test: (e) => e.code === "ACTION_REJECTED" || e.code === 4001,
    result: {
      title: "Cancelled",
      message: "You cancelled the request.",
      type: "cancelled",
    },
  },
  {
    test: (e) =>
      e.code === "INSUFFICIENT_FUNDS" ||
      /insufficient funds/i.test(e.message || ""),
    result: {
      title: "Insufficient Balance",
      message: "You don't have enough funds to cover this amount plus network fees.",
      type: "insufficient_funds",
    },
  },
  {
    test: (e) =>
      e.code === "UNPREDICTABLE_GAS_LIMIT" ||
      /cannot estimate gas/i.test(e.message || ""),
    result: {
      title: "Transaction Would Fail",
      message: "This transaction is likely to fail on-chain. Double-check the amount and address.",
      type: "gas_error",
    },
  },
  {
    test: (e) => /execution reverted/i.test(e.message || ""),
    result: {
      title: "Rejected On-Chain",
      message: "The contract rejected this transaction. Check your inputs and try again.",
      type: "contract_revert",
    },
  },
  {
    test: (e) => /nonce/i.test(e.message || "") && /(low|used|expired)/i.test(e.message || ""),
    result: {
      title: "Transaction Conflict",
      message: "Another transaction is still processing. Wait a moment and try again.",
      type: "nonce",
    },
  },
  {
    test: (e) => /invalid.*address|bad address checksum/i.test(e.message || ""),
    result: {
      title: "Invalid Address",
      message: "That address doesn't look right. Double-check it and try again.",
      type: "invalid_address",
    },
  },
  {
    test: (e) => /wrong password|incorrect passcode|invalid passcode/i.test(e.message || ""),
    result: {
      title: "Incorrect Passcode",
      message: "That passcode is incorrect. Try again.",
      type: "auth",
    },
  },
  {
    test: (e) =>
      /database not initialized|db is null|getDatabase\(\) is null/i.test(
        e.message || "",
      ),
    result: {
      title: "Still Starting Up",
      message: "The app is still getting ready. Give it a second and try again.",
      type: "not_ready",
    },
  },

  // ── Backend / API ─────────────────────────────────────────────────────────
  {
    test: (e) => e.statusCode === 429 || e.status === 429,
    result: {
      title: "Too Many Requests",
      message: "You're doing that a bit too fast. Wait a moment and try again.",
      type: "rate_limited",
    },
  },
  {
    test: (e) => (e.statusCode >= 500 && e.statusCode < 600) || (e.status >= 500 && e.status < 600),
    result: {
      title: "Server Error",
      message: "Something went wrong on our end. Please try again shortly.",
      type: "server_error",
    },
  },
  {
    test: (e) => /no route found|no quote available|liquidity/i.test(e.message || ""),
    result: {
      title: "No Route Available",
      message: "No path found for this pair right now — try a different amount, token, or chain.",
      type: "no_route",
    },
  },
  {
    test: (e) => /unexpected token|json parse|is not valid json/i.test(e.message || ""),
    result: {
      title: "Unexpected Response",
      message: "The server sent back something unexpected. Please try again.",
      type: "bad_response",
    },
  },
];

/**
 * @param {Error|{message?:string,code?:any,statusCode?:number,status?:number}} err
 * @param {{ fallbackTitle?: string, fallbackMessage?: string }} [opts]
 * @returns {{ title: string, message: string, type: string }}
 */
export const humanizeError = (err, opts = {}) => {
  const {
    fallbackTitle = "Something Went Wrong",
    fallbackMessage = "Please try again. If this keeps happening, contact support.",
  } = opts;

  if (!err) {
    return { title: fallbackTitle, message: fallbackMessage, type: "unknown" };
  }

  // Already-humanized (e.g. thrown by useBridge.js) — pass through as-is.
  if (err.title && err.message && err.type) return err;

  try {
    for (const rule of RULES) {
      if (rule.test(err)) return rule.result;
    }
  } catch {
    // A rule threw on a weird error shape — fall through to generic
  }

  // Backend errors from this app's own API shape ({ success:false, error }) —
  // the caller already extracted `error` into err.message, so if it's a short,
  // human-sounding sentence, show it directly instead of masking it.
  const msg = err.message || "";
  if (msg && msg.length < 140 && !/^[A-Za-z]+Error:/.test(msg)) {
    return { title: fallbackTitle, message: msg, type: "backend" };
  }

  return { title: fallbackTitle, message: fallbackMessage, type: "unknown" };
};

export default humanizeError;
