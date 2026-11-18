// Per-origin connection state. An origin only ever sees accounts the user
// explicitly connected to it, and each origin keeps its own EVM chain.

import { DEFAULT_EVM_CHAIN_ID } from "../shared/chains";
import type { SitePermission } from "../shared/messages";
import { K, local } from "./storage";

type Sites = Record<string, SitePermission>;

const all = () => local.get<Sites>(K.sites, {});

export async function getSite(origin: string): Promise<SitePermission | undefined> {
  return (await all())[origin];
}

export async function listSites(): Promise<SitePermission[]> {
  return Object.values(await all()).sort((a, b) => b.connectedAt - a.connectedAt);
}

export async function upsertSite(origin: string, patch: Partial<SitePermission>): Promise<SitePermission> {
  const sites = await all();
  const prev = sites[origin];
  const base: SitePermission = prev ?? { origin, evmAccounts: [], chainId: DEFAULT_EVM_CHAIN_ID, connectedAt: Date.now() };
  const next: SitePermission = { ...base, ...patch, origin };
  sites[origin] = next;
  await local.set(K.sites, sites);
  return next;
}

export async function removeSite(origin: string) {
  const sites = await all();
  delete sites[origin];
  await local.set(K.sites, sites);
}

/** Drops an account from every site it was connected to (e.g. never needed today, kept for account removal). */
export async function sitesWithEvmAccount(address: string): Promise<SitePermission[]> {
  const a = address.toLowerCase();
  return (await listSites()).filter((s) => s.evmAccounts.some((x) => x.toLowerCase() === a));
}

export function isEvmPermitted(site: SitePermission | undefined, address: string): boolean {
  if (!site) return false;
  const a = address.toLowerCase();
  return site.evmAccounts.some((x) => x.toLowerCase() === a);
}
