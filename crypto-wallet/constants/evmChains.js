// config/chains/evmChains.js
import { alchemyRpc } from "../config/Alchemy";

export const EVM_CHAINS = {
  ETHEREUM: {
    key: "ETHEREUM",
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: false,
  },

  BSC: {
    key: "BSC",
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    rpcUrl: "https://bnb-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://bscscan.com",
    icon: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=024",
    testnet: false,
  },

  POLYGON: {
    key: "POLYGON",
    id: 137,
    name: "Polygon",
    symbol: "MATIC",
    rpcUrl: alchemyRpc("polygon-mainnet"),
    explorer: "https://polygonscan.com",
    icon: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=024",
    testnet: false,
  },

  ARBITRUM: {
    key: "ARBITRUM",
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    rpcUrl: "https://arb-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://arbiscan.io",
    icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=024",
    testnet: false,
  },

  BASE: {
    key: "BASE",
    id: 8453,
    name: "Base",
    symbol: "ETH",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://basescan.org",
    icon: "https://avatars.githubusercontent.com/u/108554348?s=200&v=4",
    testnet: false,
  },

  AVALANCHE: {
    key: "AVALANCHE",
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    rpcUrl: "https://avax-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://snowtrace.io",
    icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png?v=024",
    testnet: false,
  },

  ZETACHAIN: {
    key: "ZETACHAIN",
    id: 7000,
    name: "ZetaChain",
    symbol: "ZETA",
    rpcUrl: "https://zetachain-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://explorer.zetachain.com",
    icon: "https://cryptologos.cc/logos/zetachain-zeta-logo.png",
    testnet: false,
  },

  HYPERLIQUID: {
    key: "HYPERLIQUID",
    id: 999, // Hyperliquid EVM chainId
    name: "Hyperliquid",
    symbol: "HYPE",
    rpcUrl:
      "https://hyperliquid-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://explorer.hyperliquid.xyz",
    icon: "https://hyperliquid.xyz/favicon.ico",
    testnet: false,
  },

  ABSTRACT: {
    key: "ABSTRACT",
    id: 2741,
    name: "Abstract",
    symbol: "ETH",
    rpcUrl: "https://abstract-mainnet.g.alchemy.com/v2/tlYzVPHTMFIk9YDQyrzrQ",
    explorer: "https://explorer.abstract.xyz",
    icon: "https://avatars.githubusercontent.com/u/163104803?s=200&v=4",
    testnet: false,
  },
};
