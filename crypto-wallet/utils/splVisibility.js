// utils/splVisibility.js
// Per-wallet show/hide choices for SPL tokens in the portfolio.
//
// ERC-20 visibility lives in the SQLite `tokens` table (utils/TokenDatabase),
// but that table lowercases addresses and keys chains by integer — neither
// works for Solana (mints are case-sensitive base58, the chain id is
// "SOLANA"). So SPL choices are kept here instead:
//   • held tokens show by default — `hidden` turns one off
//   • `enabled` shows a token even at zero balance
import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (owner) => `@spl_visibility:${owner}`;

/** @returns {Promise<{ enabled: Set<string>, hidden: Set<string> }>} */
export const getSplPrefs = async (owner) => {
  try {
    const raw = owner ? await AsyncStorage.getItem(keyFor(owner)) : null;
    const { enabled = [], hidden = [] } = raw ? JSON.parse(raw) : {};
    return { enabled: new Set(enabled), hidden: new Set(hidden) };
  } catch {
    return { enabled: new Set(), hidden: new Set() };
  }
};

/** Show (true) or hide (false) one mint for this wallet. */
export const setSplVisible = async (owner, mint, visible) => {
  const prefs = await getSplPrefs(owner);
  if (visible) {
    prefs.enabled.add(mint);
    prefs.hidden.delete(mint);
  } else {
    prefs.enabled.delete(mint);
    prefs.hidden.add(mint);
  }
  await AsyncStorage.setItem(
    keyFor(owner),
    JSON.stringify({ enabled: [...prefs.enabled], hidden: [...prefs.hidden] }),
  );
  return prefs;
};

/** Is this mint shown in the portfolio, given whether the wallet holds it? */
export const isSplVisible = (prefs, mint, held) =>
  !prefs.hidden.has(mint) && (held || prefs.enabled.has(mint));
