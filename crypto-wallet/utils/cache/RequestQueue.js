/**
 * RequestQueue — in-flight promise deduplicator
 *
 * Problem: during portfolio loading, 8 chains × 3 token calls = 24 simultaneous
 * Alchemy requests for the same data can land in the same render cycle.
 *
 * Solution: if key X is already being fetched, every subsequent caller for X
 * shares the same Promise instead of spawning a new network request.
 * Once the promise settles (success or error), the key is released so the
 * next call fetches again.
 *
 * Usage:
 *   const result = await queue.execute('some-key', () => fetchSomething());
 */
class RequestQueue {
  constructor() {
    this._inflight = new Map(); // key → Promise
  }

  /**
   * Execute fetcher if no in-flight request exists for key.
   * Otherwise return the existing Promise.
   *
   * @param {string}   key
   * @param {function} fetcher — () => Promise<T>
   * @returns {Promise<T>}
   */
  execute(key, fetcher) {
    if (this._inflight.has(key)) {
      return this._inflight.get(key);
    }

    const promise = Promise.resolve()
      .then(fetcher)
      .finally(() => this._inflight.delete(key));

    this._inflight.set(key, promise);
    return promise;
  }

  /** True while a fetch for this key is in progress */
  has(key) {
    return this._inflight.has(key);
  }

  /** Number of active in-flight requests (useful for debugging) */
  get size() {
    return this._inflight.size;
  }

  /** Cancel tracking (does NOT cancel the underlying request) */
  release(key) {
    this._inflight.delete(key);
  }
}

export default new RequestQueue();
