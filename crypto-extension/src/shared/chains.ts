// Mirrors crypto-wallet/constants/Chain.js and nonEvmChain.js so the extension
// and the mobile app agree on chain ids, RPCs, explorers and price ids.
// Keep the two in sync when a chain is added.

// Same key the mobile app ships with. It is public by nature (it's in every
// client bundle) — restrict it by origin/allowlist in the Alchemy dashboard.
export const ALCHEMY_API_KEY = "tlYzVPHTMFIk9YDQyrzrQ";
const alchemyRpc = (network: string) => `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

export const API_BASE_URL = "https://api.awarizon.com/api";

export interface EvmChain {
  key: string;
  id: number;
  name: string;
  symbol: string;
  nativeTokenName: string;
  decimals: 18;
  rpcUrl: string;
  explorer: string;
  icon: string;
  testnet: boolean;
  /** CoinGecko id for the native asset. */
  coingeckoId: string;
  /** CoinGecko "asset platform" for contract-address price lookups (absent = not indexed yet). */
  coingeckoPlatform?: string;
}

export const EVM_CHAINS: EvmChain[] = [
  {
    key: "ARC",
    id: 5042,
    name: "Arc",
    symbol: "USDC",
    nativeTokenName: "USDC",
    decimals: 18,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorer: "https://arc.etherscan.io",
    icon: "chains/arc.webp",
    testnet: false,
    coingeckoId: "usd-coin",
  },
  {
    key: "ROBINHOOD",
    id: 4663,
    name: "Robinhood Chain",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    icon: "chains/robinhood.png",
    testnet: false,
    coingeckoId: "ethereum",
  },
  {
    key: "ETHEREUM",
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: alchemyRpc("eth-mainnet"),
    explorer: "https://etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: false,
    coingeckoId: "ethereum",
    coingeckoPlatform: "ethereum",
  },
  {
    key: "POLYGON",
    id: 137,
    name: "Polygon",
    symbol: "POL",
    nativeTokenName: "POL",
    decimals: 18,
    rpcUrl: alchemyRpc("polygon-mainnet"),
    explorer: "https://polygonscan.com",
    icon: "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    testnet: false,
    coingeckoId: "polygon-ecosystem-token",
    coingeckoPlatform: "polygon-pos",
  },
  {
    key: "BSC",
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    nativeTokenName: "BNB",
    decimals: 18,
    rpcUrl: alchemyRpc("bnb-mainnet"),
    explorer: "https://bscscan.com",
    icon: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=024",
    testnet: false,
    coingeckoId: "binancecoin",
    coingeckoPlatform: "binance-smart-chain",
  },
  {
    key: "ARBITRUM",
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: alchemyRpc("arb-mainnet"),
    explorer: "https://arbiscan.io",
    icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=024",
    testnet: false,
    coingeckoId: "ethereum",
    coingeckoPlatform: "arbitrum-one",
  },
  {
    key: "AVALANCHE",
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    nativeTokenName: "Avalanche",
    decimals: 18,
    rpcUrl: alchemyRpc("avax-mainnet"),
    explorer: "https://snowtrace.io",
    icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png?v=024",
    testnet: false,
    coingeckoId: "avalanche-2",
    coingeckoPlatform: "avalanche",
  },
  {
    key: "BASE",
    id: 8453,
    name: "Base",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: alchemyRpc("base-mainnet"),
    explorer: "https://basescan.org",
    icon: "https://avatars.githubusercontent.com/u/108554348?s=200&v=4",
    testnet: false,
    coingeckoId: "ethereum",
    coingeckoPlatform: "base",
  },
  {
    key: "BASE_SEPOLIA",
    id: 84532,
    name: "Base Sepolia",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: alchemyRpc("base-sepolia"),
    explorer: "https://sepolia.basescan.org",
    icon: "https://avatars.githubusercontent.com/u/108554348?s=200&v=4",
    testnet: true,
    coingeckoId: "ethereum",
  },
  {
    key: "ETHEREUM_SEPOLIA",
    id: 11155111,
    name: "Ethereum Sepolia",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    decimals: 18,
    rpcUrl: alchemyRpc("eth-sepolia"),
    explorer: "https://sepolia.etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: true,
    coingeckoId: "ethereum",
  },
];

export const SOLANA = {
  key: "SOLANA",
  id: "SOLANA" as const,
  name: "Solana",
  symbol: "SOL",
  nativeTokenName: "Solana",
  decimals: 9,
  nativeMint: "So11111111111111111111111111111111111111112",
  rpcUrl: alchemyRpc("solana-mainnet"),
  explorer: "https://solscan.io",
  icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
  testnet: false,
  coingeckoId: "solana",
  coingeckoPlatform: "solana",
  /** Wallet Standard chain id. */
  standardChain: "solana:mainnet" as const,
};

export type NetworkId = number | "SOLANA";

/** Same order and set as the mobile app's DEFAULT_NETWORK_IDS. */
export const DEFAULT_NETWORK_IDS: NetworkId[] = ["SOLANA", 8453, 4663, 1];
/** The EVM chain a newly connected dApp starts on (mobile: DEFAULT_CHAIN). */
export const DEFAULT_EVM_CHAIN_ID = 8453;

const BY_ID = new Map(EVM_CHAINS.map((c) => [c.id, c]));

export function getEvmChain(id: number): EvmChain | undefined {
  return BY_ID.get(id);
}

export function requireEvmChain(id: number): EvmChain {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unsupported chain ${id}`);
  return c;
}

export const toHexChainId = (id: number) => "0x" + id.toString(16);

export function explorerTxUrl(network: NetworkId, hash: string): string {
  if (network === "SOLANA") return `${SOLANA.explorer}/tx/${hash}`;
  return `${requireEvmChain(network).explorer}/tx/${hash}`;
}

export function explorerAddressUrl(network: NetworkId, address: string): string {
  if (network === "SOLANA") return `${SOLANA.explorer}/account/${address}`;
  return `${requireEvmChain(network).explorer}/address/${address}`;
}

/** Multicall3 — same address on every chain that has it deployed. */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
