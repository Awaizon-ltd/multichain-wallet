// User-approval queue. Each sensitive dApp request becomes an Approval that the
// extension's own approval window shows; the request's promise settles when the
// user approves or rejects (or closes the window).

import { ErrorCode, ProviderError, rejected } from "../shared/errors";
import type { Approval, ApprovalKind } from "../shared/messages";
import { notifyUi } from "./events";

interface Pending {
  approval: Approval;
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
}

const pending = new Map<string, Pending>();
let approvalWindowId: number | undefined;

/** A site may not queue more than this many requests at once (spam guard). */
export const MAX_PENDING_PER_ORIGIN = 3;
export const MAX_PENDING_TOTAL = 20;

type Opener = () => Promise<void>;
let opener: Opener = openApprovalWindow;
/** Tests replace the window opener. */
export function setApprovalOpener(o: Opener) {
  opener = o;
}

export function listApprovals(): Approval[] {
  return [...pending.values()].map((p) => p.approval).sort((a, b) => a.createdAt - b.createdAt);
}

export function hasApprovals() {
  return pending.size > 0;
}

export function requestApproval<T = any>(
  kind: ApprovalKind,
  origin: string,
  details: Record<string, any>,
): Promise<T> {
  const fromOrigin = [...pending.values()].filter((p) => p.approval.origin === origin);
  if (fromOrigin.length >= MAX_PENDING_PER_ORIGIN || pending.size >= MAX_PENDING_TOTAL) {
    return Promise.reject(
      new ProviderError(ErrorCode.ResourceUnavailable, "A request from this site is already pending in Rizon."),
    );
  }
  // One connect prompt per origin at a time.
  if ((kind === "connect" || kind === "solanaConnect") && fromOrigin.some((p) => p.approval.kind === kind)) {
    return Promise.reject(new ProviderError(ErrorCode.ResourceUnavailable, "A connection request is already pending."));
  }

  const id = crypto.randomUUID();
  const approval: Approval = { id, kind, origin, createdAt: Date.now(), details };
  const promise = new Promise<T>((resolve, reject) => pending.set(id, { approval, resolve, reject }));
  notifyUi("approvals");
  opener().catch((e) => {
    // Never leave a site hanging on a prompt the user can't see.
    console.error("Rizon: could not open the approval window", e);
    rejectApproval(id, new ProviderError(ErrorCode.Internal, "Rizon couldn't open its approval window. Click the Rizon icon to review the request."));
  });
  return promise;
}

export function resolveApproval(id: string, result: unknown) {
  const p = pending.get(id);
  if (!p) throw new Error("This request is no longer pending.");
  pending.delete(id);
  p.resolve(result);
  notifyUi("approvals");
}

export function rejectApproval(id: string, error: unknown = rejected()) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  p.reject(error);
  notifyUi("approvals");
}

export function rejectAll() {
  for (const id of [...pending.keys()]) rejectApproval(id);
}

/* --------------------------- approval window --------------------------- */

const WIDTH = 380;
const HEIGHT = 640;

async function openApprovalWindow() {
  if (approvalWindowId !== undefined) {
    try {
      await chrome.windows.update(approvalWindowId, { focused: true, drawAttention: true });
      return;
    } catch {
      approvalWindowId = undefined;
    }
  }
  let left: number | undefined;
  let top: number | undefined;
  try {
    const w = await chrome.windows.getLastFocused();
    if (w.left !== undefined && w.width !== undefined && w.top !== undefined) {
      left = Math.max(0, w.left + w.width - WIDTH - 16);
      top = w.top + 72;
    }
  } catch {
    /* no focused window */
  }
  const url = chrome.runtime.getURL("index.html#/approval");
  let win: chrome.windows.Window;
  try {
    win = await chrome.windows.create({ url, type: "popup", width: WIDTH, height: HEIGHT, left, top, focused: true });
  } catch {
    // Chrome refuses bounds that aren't mostly on a visible screen (multi-monitor
    // setups, unusual window positions). Let it place the window itself.
    win = await chrome.windows.create({ url, type: "popup", width: WIDTH, height: HEIGHT, focused: true });
  }
  approvalWindowId = win.id;
}

/** Closing the approval window rejects everything it was showing. */
export function onWindowRemoved(windowId: number) {
  if (windowId !== approvalWindowId) return;
  approvalWindowId = undefined;
  rejectAll();
}
