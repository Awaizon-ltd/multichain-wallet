// Read-only data for phase 4 screens: NFTs (Alchemy NFT API v3), @usernames
// and market data (Rizon backend, which caches CoinGecko for every wallet).

import { ALCHEMY_API_KEY, API_BASE_URL, getEvmChain } from "../shared/chains";
import type { Settings } from "../shared/messages";

/* --------------------------------- cache --------------------------------- */

async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = (await chrome.storage.local.get(key))[key] as { ts: number; v: T } | undefined;
  if (hit && Date.now() - hit.ts < ttl) return hit.v;
  try {
    const v = await fetcher();
    await chrome.storage.local.set({ [key]: { ts: Date.now(), v } });
    return v;
  } catch (e) {
    if (hit) return hit.v;
    throw e;
  }
}

async function api<T = any>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) throw Object.assign(new Error(j?.message || j?.error || `Request failed (${r.status})`), { status: r.status });
  return j.data as T;
}

/* --------------------------------- NFTs --------------------------------- */

/** Chains Alchemy's NFT API indexes (same exclusions as the mobile app: not Arc/Robinhood/testnets yet). */
const NFT_NETWORKS: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  137: "polygon-mainnet",
  42161: "arb-mainnet",
  56: "bnb-mainnet",
  43114: "avax-mainnet",
};

export interface Nft {
  key: string;
  chainId: number;
  chainName: string;
  contract: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155";
  name: string;
  collection: string;
  image?: string;
  balance: string;
  spam: boolean;
  description?: string;
}

// Airdropped phishing NFTs: links and "claim your reward" bait in the name.
const SCAM_TEXT = /(https?:\/\/|www\.|\.(com|xyz|io|org|net|app|site|top|link|fun)\b|claim|reward|airdrop|visit|voucher|\$\s?\d)/i;

export async function loadNfts(owner: string, settings: Settings): Promise<{ nfts: Nft[]; unsupported: string[] }> {
  const chainIds = settings.enabledNetworks.filter((n): n is number => typeof n === "number");
  const unsupported = chainIds.filter((id) => !NFT_NETWORKS[id] && !getEvmChain(id)?.testnet).map((id) => getEvmChain(id)?.name ?? String(id));
  const per = await Promise.all(
    chainIds
      .filter((id) => NFT_NETWORKS[id])
      .map((id) =>
        cached(`nfts:${id}:${owner}`, 10 * 60_000, async () => {
          const out: Nft[] = [];
          let pageKey: string | undefined;
          for (let page = 0; page < 3; page++) {
            const q = new URLSearchParams({ owner, withMetadata: "true", pageSize: "100" });
            if (pageKey) q.set("pageKey", pageKey);
            const r = await fetch(`https://${NFT_NETWORKS[id]}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner?${q}`);
            if (!r.ok) throw new Error(`NFT API ${r.status}`);
            const j = await r.json();
            for (const n of j.ownedNfts ?? []) {
              const name = n.name || n.raw?.metadata?.name || `#${n.tokenId}`;
              const collection = n.contract?.openSeaMetadata?.collectionName || n.contract?.name || "Unknown collection";
              out.push({
                key: `${id}:${n.contract?.address}:${n.tokenId}`,
                chainId: id,
                chainName: getEvmChain(id)!.name,
                contract: n.contract?.address,
                tokenId: n.tokenId,
                standard: n.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
                name,
                collection,
                image: n.image?.thumbnailUrl || n.image?.cachedUrl || n.image?.originalUrl || undefined,
                balance: String(n.balance ?? "1"),
                spam: !!n.contract?.isSpam || SCAM_TEXT.test(name) || SCAM_TEXT.test(collection),
                description: n.description || undefined,
              });
            }
            pageKey = j.pageKey;
            if (!pageKey) break;
          }
          return out;
        }).catch(() => [] as Nft[]),
      ),
  );
  return { nfts: per.flat(), unsupported };
}

/* ------------------------------- identity ------------------------------- */

export interface Identity {
  username: string;
  evm_address: string;
  solana_address: string;
  verified_at?: string;
}

export async function identityByAddress(address: string): Promise<Identity | null> {
  try {
    return await api<Identity>(`/identity/by-address?address=${encodeURIComponent(address)}`);
  } catch (e: any) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function identityByUsername(username: string): Promise<Identity | null> {
  const u = username.trim().replace(/^@/, "").toLowerCase();
  try {
    return await api<Identity>(`/identity/${encodeURIComponent(u)}`);
  } catch (e: any) {
    if (e.status === 404) return null;
    throw e;
  }
}

export const checkUsername = (username: string, evm: string) =>
  api<{ username: string; available: boolean; reason?: string }>(
    `/identity/check?username=${encodeURIComponent(username)}&evm_address=${encodeURIComponent(evm)}`,
  );

/* --------------------------------- market --------------------------------- */

export interface MarketToken {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  change24h: number | null;
  marketCap?: number;
  volume24h?: number;
  rank?: number;
  sparkline?: number[];
}

export interface MarketTab {
  key: string;
  label: string;
  tokens: MarketToken[];
}

export const getTrending = () => cached("market:trending", 5 * 60_000, () => api<{ tabs: MarketTab[]; updatedAt: string }>("/market/trending"));
export const getCoin = (id: string) => cached(`market:coin:${id}`, 3 * 60_000, () => api<any>(`/market/coins/${encodeURIComponent(id)}`));
export const getChart = (id: string, days: number) =>
  cached(`market:chart:${id}:${days}`, days <= 1 ? 3 * 60_000 : 15 * 60_000, async () => (await api<{ prices: [number, number][] }>(`/market/coins/${encodeURIComponent(id)}/chart?days=${days}`)).prices);

export const CHART_PERIODS = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
];
