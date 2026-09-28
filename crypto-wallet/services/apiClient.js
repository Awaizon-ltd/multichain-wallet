// services/apiClient.js
// ─────────────────────────────────────────────────────────────────────────────
// The one door every screen/hook uses to talk to the crypto-backend.
// GETs are cached (stale-while-revalidate, SQLite-persisted via DataCache) —
// mutations are deduped so a double-tap can't fire the same request twice,
// and can declare which cached paths to invalidate on success.
//
// Every thrown error is already { title, message, type } from humanizeError —
// callers can pass it straight to Alert.alert(err.title, err.message).
// ─────────────────────────────────────────────────────────────────────────────

import { API_CONFIG } from "../config/api";
import { withCache, Key, TTL, invalidateApi } from "../utils/cache/DataCache";
import requestQueue from "../utils/cache/RequestQueue";
import { humanizeError } from "../utils/errors/humanizeError";

const buildUrl = (path, params) => {
  if (!params) return path;
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  ).toString();
  return qs ? `${path}?${qs}` : path;
};

const parseJson = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const err = new Error("The server sent back something unexpected.");
    err.statusCode = res.status;
    throw err;
  }
};

const raiseIfFailed = (res, data) => {
  if (res.ok && data.success !== false) return;
  const err = new Error(
    data.error || data.message || `Request failed (${res.status})`,
  );
  err.statusCode = res.status;
  throw err;
};

const doFetch = async (path, params, init) => {
  const url = buildUrl(path, params);
  const res = await fetch(`${API_CONFIG.BASE_URL}${url}`, init);
  const data = await parseJson(res);
  raiseIfFailed(res, data);
  return data;
};

/**
 * Cached GET. Stale-while-revalidate: returns cached data instantly (if any)
 * and revalidates in the background when stale — the caller never blocks on
 * a background refresh, only on a true cold miss.
 *
 * @param {string} path            e.g. "/swap/tokens"
 * @param {object} [opts]
 * @param {object} [opts.params]   query params, appended + used in the cache key
 * @param {number} [opts.ttl]      default TTL.API_SHORT — pass 0 to skip caching entirely
 * @param {boolean}[opts.persist]  survive app restart (default true)
 * @param {AbortSignal}[opts.signal] only honored when ttl is 0 — cached requests
 *   are shared/deduped across callers, so they can't be tied to one caller's signal
 */
export const apiGet = async (path, opts = {}) => {
  const { params, ttl = TTL.API_SHORT, persist = true, signal } = opts;
  const url = buildUrl(path, params);

  try {
    if (!ttl) return await doFetch(path, params, { signal }); // explicitly uncacheable (quotes, prices, etc.)

    return await withCache(
      Key.api(url),
      ttl,
      () => doFetch(path, params),
      { persist },
    );
  } catch (err) {
    throw humanizeError(err, { fallbackTitle: "Couldn't Load Data" });
  }
};

/**
 * POST/PUT/DELETE. Deduped by method+path+body so a double-tap or a
 * re-render firing the same mutation twice only hits the network once.
 *
 * @param {string} path
 * @param {object} [opts]
 * @param {"POST"|"PUT"|"DELETE"|"PATCH"} [opts.method]
 * @param {object} [opts.body]
 * @param {string[]} [opts.invalidatePaths]  cached GET paths to drop on success
 */
export const apiMutate = async (path, opts = {}) => {
  const { method = "POST", body, invalidatePaths = [] } = opts;
  const dedupeKey = `${method}:${path}:${body ? JSON.stringify(body) : ""}`;

  try {
    const data = await requestQueue.execute(dedupeKey, () =>
      doFetch(path, null, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    invalidatePaths.forEach(invalidateApi);
    return data;
  } catch (err) {
    throw humanizeError(err, { fallbackTitle: "Action Failed" });
  }
};

export default { apiGet, apiMutate };
