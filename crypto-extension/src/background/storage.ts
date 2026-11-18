// Typed wrappers over chrome.storage.
//   local   — persisted: encrypted vault, public account data, settings, site permissions, activity
//   session — memory-only: the unlocked vault key and last-activity timestamp

type Area = chrome.storage.StorageArea;

function area(a: Area) {
  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      const r = await a.get(key);
      return (r[key] as T | undefined) ?? fallback;
    },
    async set(key: string, value: unknown): Promise<void> {
      await a.set({ [key]: value });
    },
    async remove(key: string | string[]): Promise<void> {
      await a.remove(key);
    },
    async clear(): Promise<void> {
      await a.clear();
    },
  };
}

export const local = area(chrome.storage.local);
export const session = area(chrome.storage.session);

export const K = {
  vault: "vault",
  accounts: "accounts",
  selectedIndex: "selectedIndex",
  settings: "settings",
  sites: "sites",
  activity: "activity",
  customTokens: "customTokens",
  backupStatus: "backupStatus",
  evmDerivation: "evmDerivation",
  // session
  vaultKey: "vaultKey",
  lastActive: "lastActive",
} as const;
