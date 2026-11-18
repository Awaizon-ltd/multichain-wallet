// Pushes provider events (accountsChanged, chainChanged, …) to the content
// scripts of the affected origin. Events go to every tab via
// chrome.tabs.sendMessage and each content script forwards only those whose
// origin matches its own frame — so no long-lived port has to survive the
// service worker being put to sleep.

import type { Namespace } from "../shared/messages";

export interface ProviderEvent {
  channel: "rizon:event";
  /** Target origin, or "*" for all connected sites. */
  origin: string;
  ns: Namespace;
  event: string;
  data: unknown;
}

type Sink = (e: ProviderEvent) => void;
let sink: Sink = (e) => {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id === undefined) continue;
      chrome.tabs.sendMessage(t.id, e).catch(() => {});
    }
  });
};

/** Tests replace the transport. */
export function setEventSink(s: Sink) {
  sink = s;
}

export function emit(origin: string, ns: Namespace, event: string, data: unknown) {
  sink({ channel: "rizon:event", origin, ns, event, data });
}

/** Notifies open extension pages (popup / approval window) to re-read state. */
export function notifyUi(topic: string) {
  chrome.runtime.sendMessage({ channel: "rizon:ui-event", topic }).catch(() => {});
}
