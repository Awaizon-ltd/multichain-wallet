// services/marketApi.js
// Market data (trending, coin details, charts) from our backend, which pulls
// it from CoinGecko once and caches it for every wallet. Responses are also
// cached on-device (SQLite, stale-while-revalidate) via apiGet.
import { API_CONFIG } from "../config/api";
import { apiGet } from "./apiClient";

const { ENDPOINTS } = API_CONFIG;

const MIN = 60_000;
const TTL = {
  TRENDING: 5 * MIN,
  COIN: 3 * MIN,
  CHART: { 1: 3 * MIN, 7: 10 * MIN, 30: 30 * MIN, 90: 30 * MIN, 365: 60 * MIN },
  RESOLVE: 24 * 60 * MIN,
};

export const CHART_PERIODS = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
];

/** @returns {Promise<{ tabs: Array, updatedAt: string }>} */
export const getTrending = async () =>
  (await apiGet(ENDPOINTS.MARKET_TRENDING, { ttl: TTL.TRENDING })).data;

export const getCoin = async (id) =>
  (await apiGet(ENDPOINTS.MARKET_COIN(id), { ttl: TTL.COIN })).data;

/** @returns {Promise<Array<[number, number]>>} [timestampMs, priceUsd] pairs */
export const getChart = async (id, days) =>
  (
    await apiGet(ENDPOINTS.MARKET_CHART(id), {
      params: { days },
      ttl: TTL.CHART[days] ?? TTL.COIN,
    })
  ).data.prices;

/** Map a wallet token (chain + contract, or a native coin) to a CoinGecko id. */
export const resolveCoinId = async ({ chainId, address, symbol }) =>
  (
    await apiGet(ENDPOINTS.MARKET_RESOLVE, {
      params: { chainId, address, symbol },
      ttl: TTL.RESOLVE,
    })
  ).data.id;
