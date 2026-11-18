// Isolated-world relay: page (inpage.js) <-> background service worker.
// The background identifies the caller by the browser-reported origin of this
// frame, so the page can't impersonate another site.

import { CONTENT_TARGET, INPAGE_TARGET, type PageRequest } from "../shared/messages";

const targetOrigin = location.origin === "null" ? "*" : location.origin;
const post = (m: object) => window.postMessage(m, targetOrigin);

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const d = ev.data as PageRequest;
  if (!d || d.target !== CONTENT_TARGET || d.kind !== "request" || typeof d.id !== "number") return;
  let pending: Promise<any>;
  try {
    pending = chrome.runtime.sendMessage({ channel: "rizon:provider", ns: d.ns, method: d.method, params: d.params });
  } catch {
    // Extension was reloaded/updated: this content script is orphaned.
    pending = Promise.reject(new Error("invalidated"));
  }
  pending.then(
    (resp) => post({ target: INPAGE_TARGET, kind: "response", id: d.id, ...(resp ?? { error: { code: 4900, message: "No response" } }) }),
    () =>
      post({
        target: INPAGE_TARGET,
        kind: "response",
        id: d.id,
        error: { code: 4900, message: "Rizon was updated or restarted. Please reload this page." },
      }),
  );
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.channel !== "rizon:event") return;
  if (msg.origin !== "*" && msg.origin !== location.origin) return;
  post({ target: INPAGE_TARGET, kind: "event", ns: msg.ns, event: msg.event, data: msg.data });
});
