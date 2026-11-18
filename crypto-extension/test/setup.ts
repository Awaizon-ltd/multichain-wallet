// Minimal in-memory chrome.* for running the real background modules under vitest.

function storageArea() {
  let data: Record<string, unknown> = {};
  return {
    async get(key: string | string[] | null) {
      if (key === null) return structuredClone(data);
      const keys = Array.isArray(key) ? key : [key];
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(items: Record<string, unknown>) {
      // Mirror chrome: values go through JSON-ish cloning (undefined keys dropped).
      for (const [k, v] of Object.entries(items)) data[k] = JSON.parse(JSON.stringify(v ?? null));
    },
    async remove(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) delete data[k];
    },
    async clear() {
      data = {};
    },
    _dump: () => data,
  };
}

const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };

(globalThis as any).chrome = {
  storage: { local: storageArea(), session: storageArea() },
  runtime: {
    id: "test-extension-id",
    getURL: (p: string) => `chrome-extension://test-extension-id/${p}`,
    sendMessage: async () => undefined,
    onMessage: noopEvent,
    onConnect: noopEvent,
    onInstalled: noopEvent,
  },
  tabs: { query: (_q: unknown, cb: (t: unknown[]) => void) => cb([]), sendMessage: async () => undefined, create: async () => ({}) },
  windows: {
    create: async () => ({ id: 1 }),
    update: async () => ({}),
    getLastFocused: async () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    onRemoved: noopEvent,
  },
  alarms: { create() {}, onAlarm: noopEvent },
  identity: { getRedirectURL: () => "https://test-extension-id.chromiumapp.org/", launchWebAuthFlow: async () => { throw new Error("not in tests"); } },
};

export async function resetChrome() {
  await (globalThis as any).chrome.storage.local.clear();
  await (globalThis as any).chrome.storage.session.clear();
}
