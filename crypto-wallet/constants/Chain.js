// constants/Chain.js - NO IMPORTS

const ALCHEMY_API_KEY = "tlYzVPHTMFIk9YDQyrzrQ";

const alchemyRpc = (network) =>
  `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

// constants/Chain.js - NO IMPORTS
export const SUPPORTED_CHAINS = {
  ETHEREUM: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpcUrl: alchemyRpc("eth-mainnet"),
    explorer: "https://etherscan.io",
    icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    testnet: false,
  },

  MANTLE: {
    id: 5000,
    name: "Mantle",
    symbol: "MNT",
    rpcUrl: alchemyRpc("mantle-mainnet"),
    explorer: "https://mantlescan.xyz",
    icon: "https://cryptologos.cc/logos/mantle-mnt-logo.png",
    testnet: false,
  },

  POLYGON: {
    id: 137,
    name: "Polygon",
    symbol: "MATIC",
    rpcUrl: alchemyRpc("polygon-mainnet"),
    explorer: "https://polygonscan.com",
    icon: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=024",
    testnet: false,
  },

  BSC: {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    rpcUrl: alchemyRpc("bnb-mainnet"),
    explorer: "https://bscscan.com",
    icon: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=024",
    testnet: false,
  },

  ARBITRUM: {
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    rpcUrl: alchemyRpc("arb-mainnet"),
    explorer: "https://arbiscan.io",
    icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png?v=024",
    testnet: false,
  },

  AVALANCHE: {
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    rpcUrl: alchemyRpc("avax-mainnet"),
    explorer: "https://snowtrace.io",
    icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png?v=024",
    testnet: false,
  },

  BASE: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    rpcUrl: alchemyRpc("base-mainnet"),
    explorer: "https://basescan.org",
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgJzE3esFDDQJwxXfIEQy-TlsXLnWvlEOyTQ&s",
    testnet: false,
  },

  BASE_SEPOLIA: {
    id: 84532,
    name: "Base Sepolia",
    symbol: "ETH",
    rpcUrl: alchemyRpc("base-sepolia"),
    explorer: "https://sepolia.basescan.org",
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgJzE3esFDDQJwxXfIEQy-TlsXLnWvlEOyTQ&s",
    testnet: true,
  },
 
  ETHEREUM_SEPOLIA: {
    id: 11155111,
    name: "Ethereum Sepolia",
    symbol: "ETH",
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

export const DEFAULT_CHAIN = SUPPORTED_CHAINS.MANTLE;

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
