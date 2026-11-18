import { Contract, JsonRpcProvider, Network } from "ethers";
import { Connection } from "@solana/web3.js";
import { requireEvmChain, SOLANA } from "../shared/chains";

const providers = new Map<number, JsonRpcProvider>();

export function evmProvider(chainId: number): JsonRpcProvider {
  let p = providers.get(chainId);
  if (!p) {
    const chain = requireEvmChain(chainId);
    p = new JsonRpcProvider(chain.rpcUrl, Network.from(chainId), { staticNetwork: true, batchMaxCount: 10 });
    providers.set(chainId, p);
  }
  return p;
}

let solana: Connection | undefined;
export function solanaConnection(): Connection {
  solana ??= new Connection(SOLANA.rpcUrl, { commitment: "confirmed" });
  return solana;
}

const ERC20_META = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
];

export interface TokenMeta {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

const metaCache = new Map<string, TokenMeta | null>();

/** Best-effort ERC-20 metadata for approval screens; null for non-tokens. */
export async function tokenMeta(chainId: number, address: string): Promise<TokenMeta | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  if (metaCache.has(key)) return metaCache.get(key)!;
  const c = new Contract(address, ERC20_META, evmProvider(chainId));
  let meta: TokenMeta | null = null;
  try {
    const [symbol, decimals] = await Promise.all([c.symbol(), c.decimals()]);
    meta = { address, symbol: String(symbol), decimals: Number(decimals) };
  } catch {
    meta = null;
  }
  metaCache.set(key, meta);
  return meta;
}
