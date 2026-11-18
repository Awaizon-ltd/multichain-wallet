// services/pairChartService.js
// ─────────────────────────────────────────────────────────────────────────────
// Candles and on-chain market stats for Advanced Swap, from CoinGecko's
// on-chain DEX API (GeckoTerminal data, under /onchain on the CoinGecko API).
//
// Any pair is supported — same chain or cross-chain — by pricing both legs in
// USD and dividing:
//
//   BONK/SOL = BONK/USD ÷ SOL/USD        (same chain, Solana)
//   SOL/ETH  = SOL/USD  ÷ ETH/USD        (Solana leg ÷ Ethereum leg)
//   SOL/USDC = SOL/USD                   (stablecoin quote: no division)
//
// Each leg's USD candles come from that token's most-traded pool, so a pair never
// depends on a direct BONK/SOL pool existing. The synthetic high/low use the
// quote leg's close for each bucket — exact for open/close, a close
// approximation for the wicks (there's no way to know when, inside a bucket,
// each leg hit its extreme).
//
// Every upstream call goes through marketService's shared CoinGecko queue,
// so this can never push the backend past its rate limit, and through its
// stale-on-error cache.
// ─────────────────────────────────────────────────────────────────────────────

const { cgGet, cached, getCoin } = require("./marketService");
const { isSolanaChainId, WSOL_MINT } = require("../utils/solana");

const MIN = 60 * 1000;

// App chain id → GeckoTerminal network id
const NETWORKS = {
  1: "eth",
  8453: "base",
  4663: "robinhood",
  5042: "arc",
  137: "polygon_pos",
  56: "bsc",
  42161: "arbitrum",
  43114: "avax",
  SOLANA: "solana",
};

const EVM_NATIVE = new Set([
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0000000000000000000000000000000000000000",
]);

// Native coins, priced through their wrapped token's pools. Chains whose gas
// token is ETH but which have no verified WETH address here (Robinhood) use
// Ethereum's WETH — the price of ETH doesn't depend on the chain.
const WETH_MAINNET = { network: "eth", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "ETH", coinId: "ethereum" };
const NATIVE_REFS = {
  1: WETH_MAINNET,
  4663: WETH_MAINNET,
  8453: { network: "base", address: "0x4200000000000000000000000000000000000006", symbol: "ETH", coinId: "ethereum" },
  42161: { network: "arbitrum", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "ETH", coinId: "ethereum" },
  137: { network: "polygon_pos", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", symbol: "POL", coinId: "polygon-ecosystem-token" },
  56: { network: "bsc", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "BNB", coinId: "binancecoin" },
  43114: { network: "avax", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "AVAX", coinId: "avalanche-2" },
  SOLANA: { network: "solana", address: WSOL_MINT, symbol: "SOL", coinId: "solana" },
  // Arc's gas token IS USDC
  5042: { network: "arc", address: null, symbol: "USDC", stable: true },
};

// Known USD stablecoins (lowercased EVM / exact Solana) — lets a "vs USDC"
// chart skip fetching the quote leg entirely. Unknown tokens fall back to
// their on-chain symbol (STABLE_SYMBOLS).
const STABLE_ADDRESSES = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC  eth
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT  eth
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI   eth
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC  base
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC base
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC  arbitrum
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT  arbitrum
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC  polygon
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT  polygon
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC  bsc
  "0x55d398326f99059ff775485246999027b3197955", // USDT  bsc
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC  avax
  "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT  avax
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC solana
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT solana
]);
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDBC", "USDG", "PYUSD", "USD1", "USDE", "FDUSD"]);

// Timeframe → GeckoTerminal OHLCV request + cache TTL
const TIMEFRAMES = {
  "15m": { period: "minute", aggregate: 15, ttl: 1 * MIN },
  "1h": { period: "hour", aggregate: 1, ttl: 2 * MIN },
  "4h": { period: "hour", aggregate: 4, ttl: 5 * MIN },
  "1d": { period: "day", aggregate: 1, ttl: 15 * MIN },
};
const CANDLE_LIMIT = 200;

const TTL = {
  TOKEN: 2 * MIN, // price / mcap / top pools
  INFO: 30 * MIN, // holders, socials, risk flags
};

/* =========================================================
   Token references
========================================================= */

const networkFor = (chainId) =>
  NETWORKS[isSolanaChainId(chainId) ? "SOLANA" : parseInt(chainId, 10)] || null;

const isStableAddress = (address) =>
  !!address &&
  (STABLE_ADDRESSES.has(address) || STABLE_ADDRESSES.has(address.toLowerCase()));

/**
 * Resolve an app token ({ chainId, address }) to what GeckoTerminal indexes:
 * { network, address, stable, symbol? }. Native coins map to their wrapped
 * token. Throws a 400-style error for unsupported chains.
 */
const resolveRef = (chainId, address) => {
  // "usd": price in dollars (what a USDC quote means, without needing to
  // know USDC's address on every chain)
  if (String(address).toLowerCase() === "usd") {
    return { network: null, address: null, symbol: "USD", stable: true };
  }
  const solana = isSolanaChainId(chainId);
  const key = solana ? "SOLANA" : parseInt(chainId, 10);
  const network = networkFor(chainId);
  if (!network) throw badRequest(`Unsupported chain ${chainId}`);

  const native =
    !address ||
    address === "native" ||
    EVM_NATIVE.has(String(address).toLowerCase()) ||
    (solana && address === WSOL_MINT);
  if (native) {
    const ref = NATIVE_REFS[key];
    if (!ref) throw badRequest(`No price source for the native coin of chain ${chainId}`);
    return { ...ref, stable: !!ref.stable, native: true };
  }

  return { network, address, stable: isStableAddress(address) };
};

const badRequest = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

/* =========================================================
   Upstream reads (all cached)
========================================================= */

// Token + its top pools in ONE call (include=top_pools)
const getToken = (network, address) =>
  cached(`gt-token:${network}:${address}`, TTL.TOKEN, async () => {
    const body = await cgGet(
      `/onchain/networks/${network}/tokens/${address}`,
      { include: "top_pools" },
    );
    const attrs = body?.data?.attributes || {};
    const pools = (body?.included || [])
      .filter((i) => i.type === "pool")
      .map((p) => ({
        address: p.attributes.address,
        name: p.attributes.name,
        liquidityUsd: num(p.attributes.reserve_in_usd),
        volume24hUsd: num(p.attributes.volume_usd?.h24),
        priceChange: p.attributes.price_change_percentage || {},
        transactions24h: p.attributes.transactions?.h24 || null,
        dex: p.relationships?.dex?.data?.id || null,
      }))
      // By 24h volume, NOT liquidity: reported liquidity is easy to fake
      // (e.g. a $1.6B "XTX/SOL" pool trading $1.6M/day), and a pool with no
      // trades has no candles. Volume is where the real market is.
      .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
    return { attrs, pools };
  });

const getTokenInfo = (network, address) =>
  cached(`gt-info:${network}:${address}`, TTL.INFO, async () => {
    const body = await cgGet(`/onchain/networks/${network}/tokens/${address}/info`);
    return body?.data?.attributes || {};
  });

const num = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** USD candles for one token, oldest first: [{ t, o, h, l, c, v }] */
const getUsdCandles = async (ref, tf) => {
  const frame = TIMEFRAMES[tf];
  const { pools } = await getToken(ref.network, ref.address);
  const pool = pools[0];
  if (!pool) {
    const err = new Error("No liquid pool found for this token");
    err.statusCode = 404;
    throw err;
  }

  return cached(
    `gt-ohlcv:${ref.network}:${pool.address}:${ref.address}:${tf}`,
    frame.ttl,
    async () => {
      const body = await cgGet(
        `/onchain/networks/${ref.network}/pools/${pool.address}/ohlcv/${frame.period}`,
        {
          aggregate: frame.aggregate,
          limit: CANDLE_LIMIT,
          currency: "usd",
          // price THIS token, whichever side of the pool it's on
          token: ref.address,
        },
      );
      const list = body?.data?.attributes?.ohlcv_list || [];
      return list
        .map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))
        .sort((a, b) => a.t - b.t);
    },
  );
};

/* =========================================================
   Pair candles
========================================================= */

/**
 * Divide base/USD by quote/USD bucket by bucket. Buckets are aligned on
 * timestamp; a bucket either leg is missing is skipped (no fabricated data).
 * Volume is the base leg's USD volume.
 */
const divideCandles = (base, quote) => {
  const byT = new Map(quote.map((q) => [q.t, q]));
  const out = [];
  for (const b of base) {
    const q = byT.get(b.t);
    if (!q || !q.o || !q.c) continue;
    const o = b.o / q.o;
    const c = b.c / q.c;
    out.push({
      t: b.t,
      o,
      c,
      h: Math.max(o, c, b.h / q.c),
      l: Math.min(o, c, b.l / q.c),
      v: b.v,
    });
  }
  return out;
};

/**
 * Candles for base priced in quote.
 * @param {object} p { baseChain, base, quoteChain, quote, tf }
 * @returns {Promise<{ candles, synthetic, quoteIsUsd, tf }>}
 */
const getPairCandles = async ({ baseChain, base, quoteChain, quote, tf = "1h" }) => {
  if (!TIMEFRAMES[tf]) throw badRequest(`tf must be one of ${Object.keys(TIMEFRAMES).join(", ")}`);

  const baseRef = resolveRef(baseChain, base);
  const quoteRef = resolveRef(quoteChain ?? baseChain, quote);

  if (baseRef.stable && quoteRef.stable) {
    throw badRequest("Pick a non-stablecoin to chart against a stablecoin");
  }

  // Quote is a stablecoin: the base leg's USD candles ARE the pair
  if (quoteRef.stable) {
    const candles = await getUsdCandles(baseRef, tf);
    return { candles, synthetic: false, quoteIsUsd: true, tf };
  }

  // Base is a stablecoin (e.g. USDC/SOL): invert the quote leg
  if (baseRef.stable) {
    const q = await getUsdCandles(quoteRef, tf);
    const candles = q.map((k) => ({
      t: k.t,
      o: 1 / k.o,
      c: 1 / k.c,
      h: 1 / k.l,
      l: 1 / k.h,
      v: k.v,
    }));
    return { candles, synthetic: true, quoteIsUsd: false, tf };
  }

  const [b, q] = await Promise.all([
    getUsdCandles(baseRef, tf),
    getUsdCandles(quoteRef, tf),
  ]);
  return { candles: divideCandles(b, q), synthetic: true, quoteIsUsd: false, tf };
};

/* =========================================================
   Token market stats
========================================================= */

/**
 * Everything the Advanced Swap stats panel shows, for one token.
 * Holders come from the (slower-changing, separately cached) info endpoint;
 * if that one call fails the rest still renders.
 */
const getTokenStats = async ({ chainId, address }) => {
  const ref = resolveRef(chainId, address);
  if (!ref.address) {
    // Arc native USDC — nothing on-chain to look up, it's $1
    return { symbol: ref.symbol, priceUsd: 1, stable: true };
  }

  const [{ attrs, pools }, info, coin] = await Promise.all([
    getToken(ref.network, ref.address),
    getTokenInfo(ref.network, ref.address).catch(() => null),
    // Native coins are looked up through their wrapped token (wSOL, WETH…),
    // whose market cap / supply / holders describe the WRAPPER, not the
    // coin. Take the coin's own numbers from CoinGecko instead.
    ref.native && ref.coinId ? getCoin(ref.coinId).catch(() => null) : null,
  ]);

  const top = pools[0] || null;
  const supply = num(attrs.normalized_total_supply);
  const native = coin?.market
    ? {
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        priceUsd: coin.market.price,
        marketCapUsd: coin.market.marketCap,
        fdvUsd: coin.market.fdv,
        totalSupply: coin.market.totalSupply ?? coin.market.circulatingSupply,
        volume24hUsd: coin.market.volume24h,
        h24: coin.market.change24h,
      }
    : null;

  const stats = {
    network: ref.network,
    address: ref.address,
    name: attrs.name,
    symbol: attrs.symbol,
    decimals: attrs.decimals ?? null, // lets the app trade tokens outside its curated lists
    image: attrs.image_url && attrs.image_url !== "missing.png" ? attrs.image_url : null,
    coingeckoId: attrs.coingecko_coin_id || null,
    stable: ref.stable || STABLE_SYMBOLS.has(String(attrs.symbol || "").toUpperCase()),
    priceUsd: num(attrs.price_usd),
    // GeckoTerminal only reports market cap when circulating supply is
    // verified; FDV is always there. Keep both — the app labels which it has.
    marketCapUsd: num(attrs.market_cap_usd),
    fdvUsd: num(attrs.fdv_usd),
    totalSupply: supply,
    volume24hUsd: num(attrs.volume_usd?.h24),
    // The most-traded pool's liquidity, not GeckoTerminal's all-pools total,
    // which the same fake-liquidity pools inflate
    liquidityUsd: top?.liquidityUsd ?? null,
    priceChange: {
      h1: num(top?.priceChange?.h1),
      h6: num(top?.priceChange?.h6),
      h24: num(top?.priceChange?.h24),
    },
    transactions24h: top?.transactions24h ?? null,
    topPool: top ? { address: top.address, name: top.name, dex: top.dex } : null,
    holders: info?.holders?.count ?? null,
    holdersDistribution: info?.holders?.distribution_percentage ?? null,
    // Risk signals worth surfacing before someone swaps into a token
    risk: info
      ? {
          gtScore: num(info.gt_score),
          verified: !!info.gt_verified,
          honeypot: info.is_honeypot ?? null,
          mintAuthority: info.mint_authority ?? null,
          freezeAuthority: info.freeze_authority ?? null,
        }
      : null,
    links: info
      ? {
          websites: info.websites || [],
          twitter: info.twitter_handle || null,
          telegram: info.telegram_handle || null,
        }
      : null,
    description: info?.description || null,
  };

  if (!ref.native) return stats;
  // Coin-level figures win; holders / distribution / mint authority are the
  // wrapper's, so they're dropped rather than shown as the coin's.
  return {
    ...stats,
    ...(native
      ? {
          name: native.name,
          symbol: native.symbol,
          image: native.image ?? stats.image,
          priceUsd: native.priceUsd ?? stats.priceUsd,
          marketCapUsd: native.marketCapUsd,
          fdvUsd: native.fdvUsd,
          totalSupply: native.totalSupply,
          volume24hUsd: native.volume24hUsd ?? stats.volume24hUsd,
          priceChange: { ...stats.priceChange, h24: native.h24 ?? stats.priceChange.h24 },
        }
      : { symbol: ref.symbol, marketCapUsd: null, fdvUsd: null, totalSupply: null }),
    native: true,
    holders: null,
    holdersDistribution: null,
    risk: null,
  };
};

module.exports = {
  getPairCandles,
  getTokenStats,
  TIMEFRAMES,
  // exported for tests
  divideCandles,
  resolveRef,
};
