import type { ActivityItem } from "../shared/messages";
import { K, local } from "./storage";
import { evmProvider, solanaConnection } from "./rpc";

const MAX_ITEMS = 200;

export const listActivity = () => local.get<ActivityItem[]>(K.activity, []);

export async function recordActivity(item: Omit<ActivityItem, "id" | "timestamp" | "status">) {
  const items = await listActivity();
  const full: ActivityItem = { ...item, id: crypto.randomUUID(), timestamp: Date.now(), status: "pending" };
  await local.set(K.activity, [full, ...items].slice(0, MAX_ITEMS));
  return full;
}

/** Updates the status of pending items from their receipts. */
export async function refreshActivity(): Promise<ActivityItem[]> {
  const items = await listActivity();
  let changed = false;
  await Promise.all(
    items
      .filter((i) => i.status === "pending")
      .map(async (i) => {
        try {
          if (i.network === "SOLANA") {
            const st = await solanaConnection().getSignatureStatus(i.hash, { searchTransactionHistory: true });
            const v = st.value;
            if (v?.err) (i.status = "failed"), (changed = true);
            else if (v?.confirmationStatus === "confirmed" || v?.confirmationStatus === "finalized")
              (i.status = "confirmed"), (changed = true);
          } else {
            const r = await evmProvider(i.network).getTransactionReceipt(i.hash);
            if (r) {
              i.status = r.status === 1 ? "confirmed" : "failed";
              changed = true;
            }
          }
        } catch {
          /* try again later */
        }
      }),
  );
  if (changed) await local.set(K.activity, items);
  return items;
}
