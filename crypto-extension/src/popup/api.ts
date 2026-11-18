import type { UiResponse } from "../shared/messages";

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** Calls the background service worker. */
export async function call<T = any>(method: string, params?: unknown): Promise<T> {
  const resp = (await chrome.runtime.sendMessage({ channel: "rizon:ui", method, params })) as UiResponse | undefined;
  if (!resp) throw new ApiError(-32603, "Rizon's background service didn't respond. Try again.");
  if (!resp.ok) throw new ApiError(resp.error.code, resp.error.message);
  return resp.result as T;
}

/** Subscribes to background "state changed" notifications. */
export function onUiEvent(cb: (topic: string) => void): () => void {
  const l = (msg: any) => {
    if (msg?.channel === "rizon:ui-event") cb(String(msg.topic));
  };
  chrome.runtime.onMessage.addListener(l);
  return () => chrome.runtime.onMessage.removeListener(l);
}

export const isPopupWindow = () => location.hash.startsWith("#/approval");
export const isFullPage = () => location.hash.startsWith("#/onboarding") || new URLSearchParams(location.search).has("tab");
