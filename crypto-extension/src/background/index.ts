// MV3 service worker entry. All listeners are registered synchronously at the
// top level so Chrome can wake the worker for them.

import { serializeError } from "../shared/errors";
import type { Namespace } from "../shared/messages";
import { onWindowRemoved } from "./approvals";
import { handleEvm } from "./evm";
import { handleSolana } from "./solana";
import { broadcastAccounts, handleUi } from "./ui";
import { checkAutoLock } from "./wallet";

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

function senderOrigin(sender: chrome.runtime.MessageSender): string | undefined {
  if (sender.origin) return sender.origin;
  try {
    return sender.url ? new URL(sender.url).origin : undefined;
  } catch {
    return undefined;
  }
}

const isExtensionPage = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && senderOrigin(sender) === EXTENSION_ORIGIN;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== "object") return false;

  if (msg.channel === "rizon:provider") {
    // From a content script: trust the browser-reported origin, never the page.
    const origin = senderOrigin(sender);
    if (!origin || !/^https?:\/\//.test(origin) || !sender.tab) return false;
    const ns = msg.ns as Namespace;
    if ((ns !== "evm" && ns !== "solana") || typeof msg.method !== "string" || msg.method.length > 100) {
      sendResponse({ error: { code: -32600, message: "Invalid request" } });
      return false;
    }
    const run = ns === "evm" ? handleEvm(origin, msg.method, msg.params) : handleSolana(origin, msg.method, msg.params);
    run.then(
      (result) => sendResponse({ result: result ?? null }),
      (e) => sendResponse({ error: serializeError(e) }),
    );
    return true;
  }

  if (msg.channel === "rizon:ui") {
    if (!isExtensionPage(sender)) return false;
    handleUi(String(msg.method), msg.params).then(
      (result) => sendResponse({ ok: true, result: result ?? null }),
      (e) => sendResponse({ ok: false, error: serializeError(e) }),
    );
    return true;
  }
  return false;
});

// The approval window holds a port open (and pings it) so the worker stays
// alive while a dApp request waits for the user.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "rizon:keepalive" || !isExtensionPage(port.sender!)) return port.disconnect();
  port.onMessage.addListener(() => {});
});

chrome.windows.onRemoved.addListener(onWindowRemoved);

chrome.alarms.create("rizon:autolock", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "rizon:autolock") checkAutoLock().then((didLock) => {
      if (didLock) broadcastAccounts();
    });
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("index.html#/onboarding") });
});
