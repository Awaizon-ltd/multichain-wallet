// hooks/useIdentity.js
// The @username linked to an address (an account's EVM address), for
// header badges and account lists. Cached in memory for a few minutes and
// re-checked when the screen regains focus, so returning from the identity
// screen after linking shows the new username straight away (that screen
// also writes to this cache via rememberIdentity()).
import { useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { getIdentityByAddress } from "../services/identity";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // lowercased address → { identity, ts }
const listeners = new Set();

const keyOf = (address) => address?.toLowerCase();

/** Record a just-linked (or renamed) identity so every badge updates now. */
export const rememberIdentity = (address, identity) => {
  if (!address) return;
  cache.set(keyOf(address), { identity, ts: Date.now() });
  listeners.forEach((fn) => fn());
};

/**
 * @param {string} address account's EVM address
 * @returns {{ identity: object|null, loading: boolean }}
 *   identity = { username, evm_address, solana_address } or null (not linked)
 */
export default function useIdentity(address) {
  const focused = useIsFocused();
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    listeners.add(rerender);
    return () => listeners.delete(rerender);
  }, []);

  useEffect(() => {
    if (!address || !focused) return;
    const hit = cache.get(keyOf(address));
    if (hit && Date.now() - hit.ts < TTL_MS) return;
    let cancelled = false;
    setLoading(true);
    getIdentityByAddress(address)
      .then((identity) => !cancelled && rememberIdentity(address, identity))
      .catch(() => {}) // offline: keep whatever we had
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address, focused]);

  return { identity: cache.get(keyOf(address))?.identity ?? null, loading };
}
