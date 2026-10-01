// constants/Chain.js - NO APP IMPORTS (would risk circular deps with
// contexts/services that import this file). The one exception below is the
// bare 'react-native' package itself — it never imports back into app code,
// so it can't create a cycle — needed to turn local chain-icon assets into a
// URI string so every existing `<Image source={{ uri: chain.icon }} />` call
// site across the app keeps working unchanged.
import { Image } from "react-native";

const ALCHEMY_API_KEY = "tlYzVPHTMFIk9YDQyrzrQ";

const alchemyRpc = (network) =>
  `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

// constants/Chain.js - NO IMPORTS
export const SUPPORTED_CHAINS = {
  ARC: {
    id: 5042,
    name: "Arc",
    symbol: "USDC",
    nativeTokenName: "USDC",
    // Arc is Circle's stablecoin L1 — USDC is the native gas asset, exposed
    // with 18 decimals natively (like ETH) and 6 decimals as an ERC-20.
    rpcUrl: "https://rpc.mainnet.arc.io",
    publicRpcUrl: "https://rpc.mainnet.arc.io",
    explorer: "https://arc.etherscan.io",
    icon: Image.resolveAssetSource(require("../assets/banners/arc.webp")).uri,
    testnet: false,
  },
  ROBINHOOD: {
    id: 4663,
    name: "Robinhood Chain",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    // Arbitrum Orbit L2 — ETH is the native gas token, bridged in via the
    // canonical Arbitrum bridge (portal.arbitrum.io).
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    publicRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    icon: Image.resolveAssetSource(require("../assets/banners/robinhood.png"))
      .uri,
    testnet: false,
  },
  ETHEREUM: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    rpcUrl: alchemyRpc("eth-mainnet"),
    explorer: "https://etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: false,
  },

  POLYGON: {
    id: 137,
    name: "Polygon",
    symbol: "POL",
    nativeTokenName: "POL",
    rpcUrl: alchemyRpc("polygon-mainnet"),
    explorer: "https://polygonscan.com",
    icon: "https://coin-images.coingecko.com/coins/images/32440/large/pol.png",
    testnet: false,
  },

  BSC: {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    nativeTokenName: "BNB",
    rpcUrl: alchemyRpc("bnb-mainnet"),
    explorer: "https://bscscan.com",
    icon: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=024",
    testnet: false,
  },

  ARBITRUM: {
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    rpcUrl: alchemyRpc("arb-mainnet"),
    explorer: "https://arbiscan.io",
    icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=024",
    testnet: false,
  },

  AVALANCHE: {
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    nativeTokenName: "Avalanche",
    rpcUrl: alchemyRpc("avax-mainnet"),
    explorer: "https://snowtrace.io",
    icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png?v=024",
    testnet: false,
  },

  BASE: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    rpcUrl: alchemyRpc("base-mainnet"),
    explorer: "https://basescan.org",
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgJzE3esFDDQJwxXfIEQy-TlsXLnWvlEOyTQ&s",
    testnet: false,
  },

  BASE_SEPOLIA: {
    id: 84532,
    name: "Base Sepolia",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    rpcUrl: alchemyRpc("base-sepolia"),
    explorer: "https://sepolia.basescan.org",
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgJzE3esFDDQJwxXfIEQy-TlsXLnWvlEOyTQ&s",
    testnet: true,
  },

  ETHEREUM_SEPOLIA: {
    id: 11155111,
    name: "Ethereum Sepolia",
    symbol: "ETH",
    nativeTokenName: "Ethereum",
    rpcUrl: alchemyRpc("eth-sepolia"),
    explorer: "https://sepolia.etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: true,
  },

  // ZETACHAIN: {
  //   key: "ZETACHAIN",
  //   id: 7000,
  //   name: "ZetaChain",
  //   symbol: "ZETA",
  //   rpcUrl: "https://zetachain-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
  //   explorer: "https://explorer.zetachain.com",
  //   icon: "https://cryptologos.cc/logos/zetachain-zeta-logo.png",
  //   testnet: false,
  // },

  // HYPERLIQUID: {
  //   key: "HYPERLIQUID",
  //   id: 999, // Hyperliquid EVM chainId
  //   name: "Hyperliquid",
  //   symbol: "HYPE",
  //   rpcUrl:
  //     "https://hyperliquid-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
  //   explorer: "https://explorer.hyperliquid.xyz",
  //   icon: "https://hyperliquid.xyz/favicon.ico",
  //   testnet: false,
  // },
};

export const DEFAULT_CHAIN = SUPPORTED_CHAINS.ARC;

export const getChainById = (chainId) =>
  Object.values(SUPPORTED_CHAINS).find((chain) => chain.id === chainId);

export const getMainnetChains = () =>
  Object.values(SUPPORTED_CHAINS).filter((chain) => !chain.testnet);

export const getTestnetChains = () =>
  Object.values(SUPPORTED_CHAINS).filter((chain) => chain.testnet);

export const getChainByName = (name) =>
  Object.values(SUPPORTED_CHAINS).find(
    (chain) => chain.name.toLowerCase() === name.toLowerCase(),
  );

// All mainnet chains are bridgeable via LI.FI (see hooks/useBridge.js) — this
// just excludes testnets from the "bridge to" picker.
export const getBridgeableChains = () => getMainnetChains();
