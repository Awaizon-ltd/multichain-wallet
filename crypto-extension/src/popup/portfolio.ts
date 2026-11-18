// Portfolio reads (no keys involved, so they run in the popup).
// Mirrors the mobile app's approach: backend token lists, one Multicall3
// aggregate3 per chain for every ERC-20 balance, cached results painted first.

import { AbiCoder, Interface } from "ethers";
import { API_BASE_URL, EVM_CHAINS, getEvmChain, MULTICALL3, SOLANA, type EvmChain, type NetworkId } from "../shared/chains";
import type { Account, Settings } from "../shared/messages";

export interface Asset {
  key: string;
  network: NetworkId;
  chainName: string;
  chainIcon: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Token contract / SPL mint; undefined for the native asset. */
  address?: string;
  balance: string; // raw integer
  price?: number;
  change24h?: number | null;
  usd?: number;
  logo?: string;
}

interface ListToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const TOKEN_TTL = DAY;

async function cachedJson<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = (await chrome.storage.local.get(key))[key] as { ts: number; v: T } | undefined;
  if (hit && Date.now() - hit.ts < ttl) return hit.v;
  try {
    const v = await fetcher();
    await chrome.storage.local.set({ [key]: { ts: Date.now(), v } });
    return v;
  } catch (e) {
    if (hit) return hit.v; // stale beats nothing
    throw e;
  }
}

async function getJson(url: string, timeoutMs = 12_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

let rpcId = 1;
export async function rpc<T = any>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message ?? "RPC error");
  return j.result as T;
}

/* ------------------------------ token lists ------------------------------ */

export function evmTokenList(chainId: number): Promise<ListToken[]> {
  return cachedJson(`tokenlist:${chainId}`, TOKEN_TTL, async () => {
    const j = await getJson(`${API_BASE_URL}/tokens/chain/${chainId}`);
    return (j?.data ?? []).map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: Number(t.decimals),
      logoURI: t.logoURI,
    }));
  });
}

export function solanaTokenList(): Promise<Record<string, ListToken>> {
  return cachedJson("tokenlist:SOLANA", TOKEN_TTL, async () => {
    const j = await getJson(`${API_BASE_URL}/swap/tokens?chainId=SOLANA`);
    const map: Record<string, ListToken> = {};
    for (const t of j?.data?.tokens ?? []) {
      if (t.isNative) continue;
      map[t.address] = { address: t.address, symbol: t.symbol, name: t.name, decimals: Number(t.decimals), logoURI: t.logoURI };
    }
    return map;
  });
}

async function customTokens(chainId: number): Promise<ListToken[]> {
  const all = ((await chrome.storage.local.get("customTokens")).customTokens ?? {}) as Record<string, any[]>;
  return (all[chainId] ?? []).map((t) => ({ ...t, name: t.symbol }));
}

/* -------------------------------- balances -------------------------------- */

const erc20 = new Interface(["function balanceOf(address) view returns (uint256)"]);
const mc = new Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
]);
const coder = AbiCoder.defaultAbiCoder();

async function erc20Balances(chain: EvmChain, owner: string, tokens: ListToken[]): Promise<bigint[]> {
  const out: bigint[] = [];
  const CHUNK = 150;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);
    const data = mc.encodeFunctionData("aggregate3", [
      slice.map((t) => ({ target: t.address, allowFailure: true, callData: erc20.encodeFunctionData("balanceOf", [owner]) })),
    ]);
    const raw = await rpc<string>(chain.rpcUrl, "eth_call", [{ to: MULTICALL3, data }, "latest"]);
    const [results] = mc.decodeFunctionResult("aggregate3", raw);
    for (const r of results as any[]) {
      out.push(r.success && r.returnData.length >= 66 ? (coder.decode(["uint256"], r.returnData)[0] as bigint) : 0n);
    }
  }
  return out;
}

async function loadEvm(chain: EvmChain, owner: string): Promise<Asset[]> {
  const [native, list, custom] = await Promise.all([
    rpc<string>(chain.rpcUrl, "eth_getBalance", [owner, "latest"]),
    evmTokenList(chain.id).catch(() => [] as ListToken[]),
    customTokens(chain.id),
  ]);
  const seen = new Set<string>();
  const tokens = [...list, ...custom].filter((t) => {
    const k = t.address.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const balances = tokens.length ? await erc20Balances(chain, owner, tokens).catch(() => tokens.map(() => 0n)) : [];
  const assets: Asset[] = [
    {
      key: `${chain.id}:native`,
      network: chain.id,
      chainName: chain.name,
      chainIcon: chain.icon,
      symbol: chain.symbol,
      name: chain.nativeTokenName,
      decimals: 18,
      balance: BigInt(native).toString(),
      logo: chain.icon,
    },
  ];
  tokens.forEach((t, i) => {
    if (balances[i] > 0n) {
      assets.push({
        key: `${chain.id}:${t.address.toLowerCase()}`,
        network: chain.id,
        chainName: chain.name,
        chainIcon: chain.icon,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        address: t.address,
        balance: balances[i].toString(),
        logo: t.logoURI,
      });
    }
  });
  return assets;
}

const SPL_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

async function loadSolana(owner: string): Promise<Asset[]> {
  const [bal, list, ...accountsByProgram] = await Promise.all([
    rpc<{ value: number }>(SOLANA.rpcUrl, "getBalance", [owner, { commitment: "confirmed" }]),
    solanaTokenList().catch(() => ({}) as Record<string, ListToken>),
    ...SPL_PROGRAMS.map((programId) =>
      rpc<{ value: any[] }>(SOLANA.rpcUrl, "getTokenAccountsByOwner", [owner, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }]).catch(
        () => ({ value: [] }),
      ),
    ),
  ]);
  const assets: Asset[] = [
    {
      key: "SOLANA:native",
      network: "SOLANA",
      chainName: SOLANA.name,
      chainIcon: SOLANA.icon,
      symbol: SOLANA.symbol,
      name: SOLANA.nativeTokenName,
      decimals: 9,
      balance: String(bal.value),
      logo: SOLANA.icon,
    },
  ];
  const totals = new Map<string, { amount: bigint; decimals: number }>();
  for (const res of accountsByProgram) {
    for (const acc of res.value) {
      const info = acc.account?.data?.parsed?.info;
      if (!info?.mint) continue;
      const amount = BigInt(info.tokenAmount?.amount ?? "0");
      const prev = totals.get(info.mint);
      totals.set(info.mint, { amount: (prev?.amount ?? 0n) + amount, decimals: Number(info.tokenAmount?.decimals ?? 0) });
    }
  }
  for (const [mint, { amount, decimals }] of totals) {
    if (amount === 0n) continue;
    const meta = (list as Record<string, ListToken>)[mint];
    assets.push({
      key: `SOLANA:${mint}`,
      network: "SOLANA",
      chainName: SOLANA.name,
      chainIcon: SOLANA.icon,
      symbol: meta?.symbol ?? `${mint.slice(0, 4)}…`,
      name: meta?.name ?? "Unknown token",
      decimals: meta?.decimals ?? decimals,
      address: mint,
      balance: amount.toString(),
      logo: meta?.logoURI,
    });
  }
  return assets;
}

/* --------------------------------- prices --------------------------------- */

interface Px {
  usd: number;
  usd_24h_change?: number | null;
}

async function nativePrices(ids: string[]): Promise<Record<string, Px>> {
  if (!ids.length) return {};
  const key = `prices:native:${[...ids].sort().join(",")}`;
  return cachedJson(key, 2 * 60_000, () =>
    getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`),
  );
}

/** Backend batch endpoint first; public CoinGecko (one address per call) as a fallback for a few tokens. */
async function tokenPrices(network: NetworkId, addresses: string[]): Promise<Record<string, Px>> {
  if (!addresses.length) return {};
  const key = `prices:${network}:${[...addresses].sort().join(",")}`;
  return cachedJson(key, 2 * 60_000, async () => {
    try {
      const j = await getJson(`${API_BASE_URL}/market/token-prices?chainId=${network}&addresses=${addresses.join(",")}`);
      if (j?.success) {
        const out: Record<string, Px> = {};
        for (const [a, p] of Object.entries<any>(j.data ?? {})) out[a.toLowerCase()] = p;
        return out;
      }
    } catch {
      /* fall through */
    }
    const platform = network === "SOLANA" ? SOLANA.coingeckoPlatform : getEvmChain(network)?.coingeckoPlatform;
    const out: Record<string, Px> = {};
    if (!platform) return out;
    for (const a of addresses.slice(0, 8)) {
      try {
        const j = await getJson(
          `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${a}&vs_currencies=usd&include_24hr_change=true`,
        );
        const p = j?.[a.toLowerCase()] ?? j?.[a];
        if (p?.usd !== undefined) out[a.toLowerCase()] = p;
      } catch {
        break; // rate-limited: stop trying
      }
    }
    return out;
  });
}

/* --------------------------------- public --------------------------------- */

export function enabledNetworks(settings: Settings): NetworkId[] {
  return settings.enabledNetworks.filter((n) => {
    if (n === "SOLANA") return true;
    const c = getEvmChain(n);
    return !!c && (settings.showTestnets || !c.testnet);
  });
}

export const portfolioCacheKey = (account: Account) => `portfolio:${account.evm}`;

export async function cachedPortfolio(account: Account): Promise<Asset[] | null> {
  const k = portfolioCacheKey(account);
  return ((await chrome.storage.local.get(k))[k] as Asset[] | undefined) ?? null;
}

export async function loadPortfolio(account: Account, settings: Settings): Promise<{ assets: Asset[]; errors: string[] }> {
  const networks = enabledNetworks(settings);
  const errors: string[] = [];
  const perNetwork = await Promise.all(
    networks.map(async (n) => {
      try {
        if (n === "SOLANA") return await loadSolana(account.solana);
        return await loadEvm(getEvmChain(n)!, account.evm);
      } catch {
        errors.push(n === "SOLANA" ? "Solana" : getEvmChain(n)?.name ?? String(n));
        return [] as Asset[];
      }
    }),
  );
  const assets = perNetwork.flat();

  // Prices
  const nativeIds = new Set<string>();
  for (const n of networks) nativeIds.add(n === "SOLANA" ? SOLANA.coingeckoId : getEvmChain(n)!.coingeckoId);
  const [natives, ...tokenPx] = await Promise.all([
    nativePrices([...nativeIds]).catch(() => ({}) as Record<string, Px>),
    ...networks.map((n) => {
      const addrs = assets.filter((a) => a.network === n && a.address).map((a) => a.address!);
      return tokenPrices(n, addrs).catch(() => ({}) as Record<string, Px>);
    }),
  ]);
  const byNetwork = new Map(networks.map((n, i) => [n, tokenPx[i]]));
  for (const a of assets) {
    let px: Px | undefined;
    if (!a.address) {
      const id = a.network === "SOLANA" ? SOLANA.coingeckoId : getEvmChain(a.network as number)!.coingeckoId;
      px = (natives as Record<string, Px>)[id];
      const chain = a.network === "SOLANA" ? undefined : getEvmChain(a.network as number);
      if (chain?.testnet) px = undefined; // testnet coins are worthless
    } else {
      px = byNetwork.get(a.network)?.[a.address.toLowerCase()];
    }
    if (px) {
      a.price = px.usd;
      a.change24h = px.usd_24h_change ?? null;
      a.usd = (Number(a.balance) / 10 ** a.decimals) * px.usd;
    }
  }
  // Highest value first; then native assets before tokens; then alphabetical.
  assets.sort(
    (x, y) =>
      (y.usd ?? -1) - (x.usd ?? -1) ||
      (x.address ? 1 : 0) - (y.address ? 1 : 0) ||
      x.symbol.localeCompare(y.symbol),
  );

  await chrome.storage.local.set({ [portfolioCacheKey(account)]: assets });
  return { assets, errors };
}

export const allEvmChains = EVM_CHAINS;
